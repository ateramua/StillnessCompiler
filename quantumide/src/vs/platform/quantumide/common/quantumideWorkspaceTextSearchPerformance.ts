/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/** §11 acceptance: agent text search on ~10k-file workspace (milliseconds). */
export const QUANTUMIDE_WORKSPACE_TEXT_SEARCH_P95_BUDGET_MS = 3000;

/** Fast sample-tree gate in `quantumide-workspace-discovery-verify.sh`. */
export const QUANTUMIDE_WORKSPACE_TEXT_SEARCH_SAMPLE_P95_BUDGET_MS = 500;

export function computeQuantumIDEWorkspaceTextSearchP95Ms(samples: readonly number[]): number {
	if (samples.length === 0) {
		return 0;
	}
	const sorted = [...samples].sort((a, b) => a - b);
	return sorted[Math.min(Math.floor(sorted.length * 0.95), sorted.length - 1)];
}
