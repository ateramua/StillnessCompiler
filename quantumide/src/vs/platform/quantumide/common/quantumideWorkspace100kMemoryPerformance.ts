/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import {
	getQuantumIDEL2PrefixPathCache,
	resetQuantumIDEWorkspacePerformanceCoordinatorForTests,
	syncQuantumIDEL2PrefixCache,
} from './quantumideWorkspacePerformanceCoordinator.js';
import { buildQuantumIDEWorkspaceGraphStructureIndex } from './quantumideWorkspaceGraphStructureIndex.js';
import {
	estimateQuantumIDEWorkspaceCacheMemoryFromPaths,
	isQuantumIDEWorkspaceCacheWithinMemoryBudget,
	measureQuantumIDEHeapDeltaBytes,
	QUANTUMIDE_DEFAULT_MEMORY_BUDGET_MB,
} from './quantumideWorkspaceMemoryBudget.js';

/** AC-04-03 / SC-01: 100k-file workspace in-memory cache budget (megabytes). */
export const QUANTUMIDE_100K_MEMORY_BUDGET_MB = QUANTUMIDE_DEFAULT_MEMORY_BUDGET_MB;

export const QUANTUMIDE_100K_FIXTURE_PATH_COUNT = 100_000;

export function buildQuantumIDE100kFixturePaths(fileCount = QUANTUMIDE_100K_FIXTURE_PATH_COUNT): string[] {
	return Array.from({ length: fileCount }, (_, i) => `src/pkg${i % 500}/module${i}.ts`);
}

export interface IQuantumIDE100kMemoryMeasurement {
	readonly pathCount: number;
	readonly estimatedMb: number;
	readonly heapDeltaMb: number;
	readonly withinBudget: boolean;
}

/**
 * Warms L1 structure index + L2 prefix cache for 100k paths; checks analytical + heap budgets.
 */
export function measureQuantumIDE100kWorkspaceCacheMemory(
	memoryBudgetMb = QUANTUMIDE_100K_MEMORY_BUDGET_MB,
): IQuantumIDE100kMemoryMeasurement {
	resetQuantumIDEWorkspacePerformanceCoordinatorForTests();
	const paths = buildQuantumIDE100kFixturePaths();
	const estimate = estimateQuantumIDEWorkspaceCacheMemoryFromPaths(paths, memoryBudgetMb);
	const heapDeltaBytes = measureQuantumIDEHeapDeltaBytes(() => {
		buildQuantumIDEWorkspaceGraphStructureIndex(paths);
		syncQuantumIDEL2PrefixCache(paths);
	});
	const heapDeltaMb = heapDeltaBytes / (1024 * 1024);
	const l2 = getQuantumIDEL2PrefixPathCache();
	if (l2.pathCount !== paths.length) {
		throw new Error(`L2 warm failed: expected ${paths.length} paths, got ${l2.pathCount}`);
	}
	const withinEstimate = isQuantumIDEWorkspaceCacheWithinMemoryBudget(estimate, memoryBudgetMb);
	const withinHeap = heapDeltaBytes === 0 || heapDeltaMb <= memoryBudgetMb;
	return {
		pathCount: paths.length,
		estimatedMb: estimate.totalMb,
		heapDeltaMb,
		withinBudget: withinEstimate && withinHeap,
	};
}
