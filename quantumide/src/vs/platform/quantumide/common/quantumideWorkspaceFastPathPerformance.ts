/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import type { IQuantumIDEWorkspaceGraph } from './quantumideWorkspaceGraph.js';
import { QuantumIDEWorkspaceFastPath } from './quantumideWorkspaceFastPath.js';

/** AC-02-01: 1000 sequential warm `exists` calls (milliseconds, total). */
export const QUANTUMIDE_FAST_PATH_EXISTS_WARM_BATCH_BUDGET_MS = 50;

export const QUANTUMIDE_FAST_PATH_EXISTS_WARM_BATCH_SIZE = 1000;

export function buildQuantumIDEWarmFastPathFixtureGraph(fileCount: number): IQuantumIDEWorkspaceGraph {
	const files = Array.from({ length: fileCount }, (_, i) => ({
		uri: `file:///warm/src/file${i}.ts`,
		workspaceRelativePath: `src/file${i}.ts`,
		name: `file${i}.ts`,
		extension: '.ts',
	}));
	return {
		version: 1,
		workspaceId: 'fast-path-warm-fixture',
		folders: [{ name: 'warm', uri: 'file:///warm' }],
		projects: [],
		manifests: [],
		files,
		status: { indexed: true, reason: 'fast-path-fixture' },
	};
}

/** Populate L0 stat cache (not timed). */
export function warmQuantumIDEWorkspaceFastPathExistsCache(
	fastPath: QuantumIDEWorkspaceFastPath,
	paths: readonly string[],
): void {
	for (const path of paths) {
		fastPath.exists(path);
	}
}

/**
 * Measures total wall time for {@link iterations} sequential
 * {@link QuantumIDEWorkspaceFastPath.exists} calls (caller must warm graph + L0 first).
 */
export function measureQuantumIDEWarmExistsBatchMs(
	fastPath: QuantumIDEWorkspaceFastPath,
	paths: readonly string[],
	iterations = QUANTUMIDE_FAST_PATH_EXISTS_WARM_BATCH_SIZE,
): number {
	const start = performance.now();
	for (let i = 0; i < iterations; i++) {
		fastPath.exists(paths[i % paths.length]!);
	}
	return performance.now() - start;
}

/** Fixture graph + warm + timed batch (used by unit tests and verify script). */
export function measureQuantumIDEWarmExistsBatchFromGraphMs(
	fileCount = QUANTUMIDE_FAST_PATH_EXISTS_WARM_BATCH_SIZE,
): { totalMs: number; hits: number; misses: number } {
	const graph = buildQuantumIDEWarmFastPathFixtureGraph(fileCount);
	const paths = graph.files.map(f => f.workspaceRelativePath);
	const fastPath = new QuantumIDEWorkspaceFastPath();
	fastPath.warmFromGraph(graph);
	warmQuantumIDEWorkspaceFastPathExistsCache(fastPath, paths);
	fastPath.resetCounters();
	const totalMs = measureQuantumIDEWarmExistsBatchMs(fastPath, paths, fileCount);
	const { hits, misses } = fastPath.counters;
	return { totalMs, hits, misses };
}
