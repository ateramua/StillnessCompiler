/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { applyQuantumIDESemanticIncrementalCore } from './quantumideSemanticIncrementalCore.js';
import { buildAstIndex, buildSemanticIndex } from './quantumideSemanticIndex.js';
import { createQuantumIDESemanticIncrementalFixtureSource } from './quantumideSemanticIncrementalPerformance.js';
import {
	beginQuantumIDEIndexingMainThreadSession,
	endQuantumIDEIndexingMainThreadSession,
	getQuantumIDEIndexingMainThreadLongTaskCount,
	recordQuantumIDEIndexingMainThreadSlice,
	resetQuantumIDEIndexingMainThreadMetrics,
} from './quantumideMainThreadLongTask.js';

export const QUANTUMIDE_INDEXER_WORKER_SLICE_YIELD_MS = 16;

export interface IQuantumIDEIndexingIsolationCompareResult {
	readonly baselineLongTasks: number;
	readonly isolatedLongTasks: number;
	readonly fileCount: number;
}

/**
 * Baseline: multi-file blocks on main thread with no event-loop yield (pre-worker indexing).
 */
export function measureBaselineBlockingIndexingLongTasks(fileCount: number): number {
	resetQuantumIDEIndexingMainThreadMetrics();
	beginQuantumIDEIndexingMainThreadSession();
	const text = createQuantumIDESemanticIncrementalFixtureSource();
	let semanticIndex = buildSemanticIndex([{ path: 'src/seed.ts', text: 'export const seed = 1;' }]);
	let astIndex = buildAstIndex([{ path: 'src/seed.ts', text: 'export const seed = 1;' }]);
	const sliceStart = performance.now();
	for (let i = 0; i < fileCount; i++) {
		const path = `src/pkg/file${i}.ts`;
		const core = applyQuantumIDESemanticIncrementalCore({
			relativePath: path,
			text,
			semanticIndex,
			astIndex,
		});
		if (core.semanticIndex) {
			semanticIndex = core.semanticIndex;
		}
		if (core.astIndex) {
			astIndex = core.astIndex;
		}
	}
	recordQuantumIDEIndexingMainThreadSlice(performance.now() - sliceStart);
	endQuantumIDEIndexingMainThreadSession();
	return getQuantumIDEIndexingMainThreadLongTaskCount();
}

/**
 * Isolated: per-file slices + event-loop yield (scheduler / worker-style).
 */
export async function measureYieldedIndexingLongTasks(fileCount: number): Promise<number> {
	resetQuantumIDEIndexingMainThreadMetrics();
	beginQuantumIDEIndexingMainThreadSession();
	const text = createQuantumIDESemanticIncrementalFixtureSource();
	let semanticIndex = buildSemanticIndex([{ path: 'src/seed.ts', text: 'export const seed = 1;' }]);
	let astIndex = buildAstIndex([{ path: 'src/seed.ts', text: 'export const seed = 1;' }]);
	for (let i = 0; i < fileCount; i++) {
		const path = `src/pkg/file${i}.ts`;
		const sliceStart = performance.now();
		const core = applyQuantumIDESemanticIncrementalCore({
			relativePath: path,
			text,
			semanticIndex,
			astIndex,
		});
		if (core.semanticIndex) {
			semanticIndex = core.semanticIndex;
		}
		if (core.astIndex) {
			astIndex = core.astIndex;
		}
		recordQuantumIDEIndexingMainThreadSlice(performance.now() - sliceStart);
		await new Promise<void>(resolve => setTimeout(resolve, QUANTUMIDE_INDEXER_WORKER_SLICE_YIELD_MS));
	}
	endQuantumIDEIndexingMainThreadSession();
	return getQuantumIDEIndexingMainThreadLongTaskCount();
}

export async function compareQuantumIDEIndexingMainThreadIsolation(
	fileCount: number,
): Promise<IQuantumIDEIndexingIsolationCompareResult> {
	const baselineLongTasks = measureBaselineBlockingIndexingLongTasks(fileCount);
	const isolatedLongTasks = await measureYieldedIndexingLongTasks(fileCount);
	return { baselineLongTasks, isolatedLongTasks, fileCount };
}

export function isQuantumIDEIndexingIsolationAcceptable(result: IQuantumIDEIndexingIsolationCompareResult): boolean {
	return result.baselineLongTasks > 0 && result.isolatedLongTasks < result.baselineLongTasks;
}
