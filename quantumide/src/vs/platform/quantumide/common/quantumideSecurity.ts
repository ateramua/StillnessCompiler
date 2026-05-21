/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { isEqualOrParent } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import type { IQuantumIDEWorkspacePolicies } from './quantumideWorkspacePolicies.js';

/** Dangerous terminal patterns (§5.1 / §2.7). */
export const QUANTUMIDE_DANGEROUS_COMMAND_PATTERNS: readonly RegExp[] = [
	/\brm\s+(-[^\s]*f|--force)\b/,
	/\bsudo\b/,
	/\bmkfs\b/,
	/\bdd\s+if=/,
	/>\s*\/dev\//,
	/\bchmod\s+777\b/,
	/\bcurl\b.*\|\s*(ba)?sh\b/,
	/\bwget\b.*\|\s*(ba)?sh\b/,
];

export function isDangerousQuantumIDETerminalCommand(command: string, blockEnabled = true): boolean {
	if (!blockEnabled) {
		return false;
	}
	const normalized = command.trim().toLowerCase();
	if (!normalized) {
		return false;
	}
	return QUANTUMIDE_DANGEROUS_COMMAND_PATTERNS.some(pattern => pattern.test(normalized));
}

export function isQuantumIDEPathExcluded(relativePath: string, excludedPaths: readonly string[] | undefined): boolean {
	if (!excludedPaths?.length) {
		return false;
	}
	const normalized = relativePath.replace(/\\/g, '/');
	for (const pattern of excludedPaths) {
		const p = pattern.replace(/\\/g, '/').replace(/\/$/, '');
		if (!p) {
			continue;
		}
		if (normalized === p || normalized.startsWith(`${p}/`)) {
			return true;
		}
	}
	return false;
}

export function isQuantumIDEAgentWritePathAllowed(
	workspaceRoot: URI | undefined,
	target: URI,
	policies: IQuantumIDEWorkspacePolicies | undefined,
): boolean {
	if (!workspaceRoot) {
		return true;
	}
	if (!isEqualOrParent(target, workspaceRoot)) {
		return false;
	}
	const relative = target.fsPath.slice(workspaceRoot.fsPath.length).replace(/^[/\\]/, '');
	if (relative.includes('..')) {
		return false;
	}
	if (isQuantumIDEPathExcluded(relative, policies?.excludedPaths)) {
		return false;
	}
	return true;
}

export function mergeQuantumIDEEnterprisePolicies(
	base: IQuantumIDEWorkspacePolicies | undefined,
	enterprise: IQuantumIDEWorkspacePolicies | undefined,
): IQuantumIDEWorkspacePolicies | undefined {
	if (!base && !enterprise) {
		return undefined;
	}
	return {
		allowAutoApplyEdits: enterprise?.allowAutoApplyEdits ?? base?.allowAutoApplyEdits,
		allowTerminalExecution: enterprise?.allowTerminalExecution ?? base?.allowTerminalExecution,
		maxEditScope: enterprise?.maxEditScope ?? base?.maxEditScope,
		excludedPaths: [...(base?.excludedPaths ?? []), ...(enterprise?.excludedPaths ?? [])],
		customPromptPrefix: [enterprise?.customPromptPrefix, base?.customPromptPrefix].filter(Boolean).join('\n') || undefined,
	};
}

export function shouldQuantumIDEBlockExternalIndexing(localIndexingOnly: boolean): boolean {
	return localIndexingOnly === true;
}
