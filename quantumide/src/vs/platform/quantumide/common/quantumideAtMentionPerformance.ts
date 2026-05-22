/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { quantumideFuzzyMatchFilePaths } from './quantumideFuzzyFileMatch.js';

import { buildQuantumIDEAtMentionPathsFromGraph } from './quantumideAtMentionPathCache.js';
import type { IQuantumIDEWorkspaceGraph } from './quantumideWorkspaceGraph.js';

/** §11 acceptance: @ mention fuzzy match on warm graph (milliseconds). */
export const QUANTUMIDE_AT_MENTION_MATCH_BUDGET_MS = 200;

/** AC-01-03: cold open with cached graph before lite scan completes (milliseconds, P95). */
export const QUANTUMIDE_AT_MENTION_COLD_OPEN_BUDGET_MS = 400;

/** §11 / AC-01-03: path count used in cold-open fixture (cached graph, pre-lite-scan). */
export const QUANTUMIDE_AT_MENTION_COLD_OPEN_PATH_COUNT = 10_000;

export function computeQuantumIDEAtMentionP95Ms(samples: readonly number[]): number {
	if (samples.length === 0) {
		return 0;
	}
	const sorted = [...samples].sort((a, b) => a - b);
	const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
	return sorted[idx]!;
}

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

/**
 * AC-01-03: sync path build from cached graph + fuzzy match (no IFileService / ignore file I/O).
 */
export function measureQuantumIDEAtMentionColdOpenP95Ms(
	graph: IQuantumIDEWorkspaceGraph,
	query: string,
	iterations = 60,
): { readonly p95Ms: number; readonly pathCount: number } {
	const samples: number[] = [];
	for (let i = 0; i < iterations; i++) {
		const t0 = performance.now();
		const paths = buildQuantumIDEAtMentionPathsFromGraph(graph);
		quantumideFuzzyMatchFilePaths(query, paths, 20);
		samples.push(performance.now() - t0);
	}
	const paths = buildQuantumIDEAtMentionPathsFromGraph(graph);
	return {
		p95Ms: computeQuantumIDEAtMentionP95Ms(samples),
		pathCount: paths.length,
	};
}
