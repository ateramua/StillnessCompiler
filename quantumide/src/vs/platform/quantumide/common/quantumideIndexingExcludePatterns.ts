/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import type { IQuantumIDEWorkspaceIgnorePolicy } from './quantumideWorkspaceIgnore.js';

/**
 * Merges `quantumide.ai.indexing.excludePatterns` into an ignore policy:
 * single-segment names → directory excludes; globs/paths → indexing-only patterns.
 */
export function mergeQuantumIDEIndexingExcludePatterns(
	policy: IQuantumIDEWorkspaceIgnorePolicy,
	configuredPatterns: readonly string[] | undefined,
): IQuantumIDEWorkspaceIgnorePolicy {
	if (!configuredPatterns?.length) {
		return policy;
	}
	const excludedDirectoryNames = new Set(policy.excludedDirectoryNames);
	const indexingOnlyPatterns = [...policy.indexingOnlyPatterns];
	for (const item of configuredPatterns) {
		const trimmed = typeof item === 'string' ? item.trim() : '';
		if (!trimmed) {
			continue;
		}
		if (!trimmed.includes('/') && !trimmed.includes('\\') && !trimmed.includes('*')) {
			excludedDirectoryNames.add(trimmed);
		} else {
			indexingOnlyPatterns.push(trimmed);
		}
	}
	return {
		...policy,
		excludedDirectoryNames,
		indexingOnlyPatterns,
	};
}
