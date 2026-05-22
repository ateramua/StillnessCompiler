/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import {
	bumpQuantumIDEWorkspaceGraphGeneration,
	getQuantumIDEL2PrefixPathCache,
	getQuantumIDEL5QueryResultCache,
	resetQuantumIDEWorkspacePerformanceCoordinatorForTests,
} from './quantumideWorkspacePerformanceCoordinator.js';
import { QUANTUMIDE_QUERY_CACHE_MAX_ENTRIES } from './quantumideQueryResultCache.js';

/** AC-04-01: generation bump must clear L2/L5 within this budget (milliseconds). */
export const QUANTUMIDE_CACHE_GENERATION_CLEAR_BUDGET_MS = 100;

export function buildQuantumIDEGenerationBumpFixturePaths(fileCount: number): string[] {
	return Array.from({ length: fileCount }, (_, i) => `src/pkg${i % 500}/module${i}.ts`);
}

/**
 * Warms L2 (10k paths) + L5 (500 entries), then measures synchronous clear on generation bump.
 */
export function measureQuantumIDEGenerationBumpClearL2L5Ms(
	pathCount = 10_000,
	queryEntryCount = QUANTUMIDE_QUERY_CACHE_MAX_ENTRIES,
): { clearDurationMs: number; l2After: number; l5After: number } {
	resetQuantumIDEWorkspacePerformanceCoordinatorForTests();
	const paths = buildQuantumIDEGenerationBumpFixturePaths(pathCount);
	bumpQuantumIDEWorkspaceGraphGeneration(paths);
	const l5 = getQuantumIDEL5QueryResultCache();
	for (let i = 0; i < queryEntryCount; i++) {
		l5.set(`search:q${i}`, `result-${i}`);
	}
	const l2 = getQuantumIDEL2PrefixPathCache();
	if (l2.pathCount !== pathCount || l5.size !== queryEntryCount) {
		throw new Error(`fixture warm failed: L2=${l2.pathCount} L5=${l5.size}`);
	}
	const bump = bumpQuantumIDEWorkspaceGraphGeneration();
	return {
		clearDurationMs: bump.clearDurationMs,
		l2After: bump.l2PathCount,
		l5After: bump.l5EntryCount,
	};
}
