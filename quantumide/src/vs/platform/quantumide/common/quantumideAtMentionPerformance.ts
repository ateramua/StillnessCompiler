/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { quantumideFuzzyMatchFilePaths } from './quantumideFuzzyFileMatch.js';

/** §11 acceptance: @ mention fuzzy match on warm graph (milliseconds). */
export const QUANTUMIDE_AT_MENTION_MATCH_BUDGET_MS = 200;

/**
 * Measures average wall time for one fuzzy match invocation (warm paths array, no I/O).
 * Used by `quantumide-workspace-discovery-verify.sh`.
 */
export function measureQuantumIDEAtMentionFuzzyMatchMs(
	paths: readonly string[],
	query: string,
	iterations = 30,
): number {
	if (paths.length === 0) {
		return 0;
	}
	quantumideFuzzyMatchFilePaths(query, paths, 20);
	const start = performance.now();
	for (let i = 0; i < iterations; i++) {
		quantumideFuzzyMatchFilePaths(query, paths, 20);
	}
	return (performance.now() - start) / iterations;
}
