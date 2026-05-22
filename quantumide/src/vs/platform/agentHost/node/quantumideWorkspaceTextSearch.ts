/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import { rgPath } from '@vscode/ripgrep';
import {
	computeQuantumIDEWorkspaceTextSearchP95Ms,
	QUANTUMIDE_WORKSPACE_TEXT_SEARCH_P95_BUDGET_MS,
	QUANTUMIDE_WORKSPACE_TEXT_SEARCH_SAMPLE_P95_BUDGET_MS,
} from '../../quantumide/common/quantumideWorkspaceTextSearchPerformance.js';

export {
	computeQuantumIDEWorkspaceTextSearchP95Ms,
	QUANTUMIDE_WORKSPACE_TEXT_SEARCH_P95_BUDGET_MS,
	QUANTUMIDE_WORKSPACE_TEXT_SEARCH_SAMPLE_P95_BUDGET_MS,
};

/** M-15: ripgrep timeout before scan fallback (M-16). */
export const QUANTUMIDE_WORKSPACE_TEXT_SEARCH_TIMEOUT_MS = 30_000;

const rgDiskPath = rgPath.replace(/\bnode_modules\.asar\b/, 'node_modules.asar.unpacked');

let ripgrepSpawnCount = 0;

export function getQuantumIDEWorkspaceTextRipgrepSpawnCount(): number {
	return ripgrepSpawnCount;
}

export function resetQuantumIDEWorkspaceTextRipgrepSpawnCountForTests(): void {
	ripgrepSpawnCount = 0;
}

export type QuantumIDEWorkspaceTextSearchEngine = 'ripgrep' | 'scan';

export interface IQuantumIDEWorkspaceTextRipgrepResult {
	readonly matches: string[];
	readonly durationMs: number;
	readonly engine: 'ripgrep';
}

/**
 * Ripgrep text search for agent `search_workspace_text` (M-15).
 * Uses bundled `@vscode/ripgrep`, honours ignore files, caps matches.
 * Returns `undefined` when rg is unavailable or exits with an error (caller runs scan fallback).
 */
export async function searchQuantumIDEWorkspaceTextWithRipgrep(
	rootPath: string,
	query: string,
	maxResults: number,
	options?: { timeoutMs?: number },
): Promise<IQuantumIDEWorkspaceTextRipgrepResult | undefined> {
	const trimmed = query.trim();
	if (!trimmed || !rootPath) {
		return undefined;
	}
	const timeoutMs = options?.timeoutMs ?? QUANTUMIDE_WORKSPACE_TEXT_SEARCH_TIMEOUT_MS;
	const started = Date.now();
	const args = [
		'--line-number',
		'--no-config',
		'--hidden',
		'--no-require-git',
		'--max-count', String(Math.max(1, maxResults)),
		'--glob', '!node_modules/**',
		'--glob', '!.git/**',
		'--glob', '!out/**',
		'--glob', '!dist/**',
		'--glob', '!*.min.js',
		'-F', trimmed,
		'.',
	];

	return new Promise(resolve => {
		let child: cp.ChildProcess;
		try {
			ripgrepSpawnCount++;
			child = cp.spawn(rgDiskPath, args, { cwd: rootPath, stdio: ['ignore', 'pipe', 'pipe'] });
		} catch {
			resolve(undefined);
			return;
		}

		let stdout = '';
		let settled = false;
		const finish = (value: IQuantumIDEWorkspaceTextRipgrepResult | undefined) => {
			if (settled) {
				return;
			}
			settled = true;
			clearTimeout(timer);
			resolve(value);
		};

		const timer = setTimeout(() => {
			try {
				child.kill();
			} catch {
				// ignore
			}
			finish(undefined);
		}, timeoutMs);

		child.stdout?.setEncoding('utf8');
		child.stdout?.on('data', chunk => { stdout += String(chunk); });
		child.on('error', () => finish(undefined));
		child.on('close', code => {
			if (code === 0 || code === 1) {
				const matches = stdout.split('\n').filter(Boolean).slice(0, maxResults);
				finish({
					matches,
					durationMs: Date.now() - started,
					engine: 'ripgrep',
				});
				return;
			}
			finish(undefined);
		});
	});
}
