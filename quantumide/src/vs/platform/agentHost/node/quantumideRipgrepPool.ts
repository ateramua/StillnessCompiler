/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import {
	searchQuantumIDEWorkspaceTextWithRipgrep,
	type IQuantumIDEWorkspaceTextRipgrepResult,
} from './quantumideWorkspaceTextSearch.js';

/** Req-07/11: reuse ripgrep invocations via bounded concurrency pool. */
const MAX_CONCURRENT_RG = 4;
let active = 0;
const queue: Array<() => void> = [];

function acquireSlot(): Promise<void> {
	if (active < MAX_CONCURRENT_RG) {
		active++;
		return Promise.resolve();
	}
	return new Promise(resolve => queue.push(resolve));
}

function releaseSlot(): void {
	active = Math.max(0, active - 1);
	const next = queue.shift();
	if (next) {
		active++;
		next();
	}
}

export async function searchQuantumIDEWorkspaceTextWithRipgrepPooled(
	rootPath: string,
	query: string,
	maxResults: number,
	options?: { timeoutMs?: number },
): Promise<IQuantumIDEWorkspaceTextRipgrepResult | undefined> {
	await acquireSlot();
	try {
		return await searchQuantumIDEWorkspaceTextWithRipgrep(rootPath, query, maxResults, options);
	} finally {
		releaseSlot();
	}
}

export function getQuantumIDERipgrepPoolActiveCount(): number {
	return active;
}

export function resetQuantumIDERipgrepPoolForTests(): void {
	active = 0;
	queue.length = 0;
}
