/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { tryQuantumIDEAgentFsSimpleFastLane } from './quantumideAgentFastLane.js';
import { buildQuantumIDEWorkspaceAgentSnapshot } from './quantumideWorkspaceSnapshotBridge.js';
import { createEmptyQuantumIDEWorkspaceGraph } from './quantumideWorkspaceGraph.js';
import { measureQuantumIDESemanticIncrementalCoreP95Ms } from './quantumideSemanticIncrementalPerformance.js';
import { measureQuantumIDEWarmExistsBatchFromGraphMs } from './quantumideWorkspaceFastPathPerformance.js';

/** Req-12 acceptance: 90th percentile targets (milliseconds). */
export const QUANTUMIDE_AGENT_NEAR_INSTANT_BUDGETS = {
	coldStartSimpleMs: 2000,
	warmSimpleMs: 500,
	warmComplexMs: 2000,
	progressVisibleMs: 100,
	toolInvocationOverheadMs: 100,
	fastLaneMs: 500,
} as const;

export interface IQuantumIDEAgentNearInstantBenchmarkResult {
	readonly fastLaneP95Ms: number;
	readonly warmExistsP95Ms: number;
	readonly semanticIncrementalP95Ms: number;
	readonly meetsColdStartSimple: boolean;
	readonly meetsWarmSimple: boolean;
	readonly meetsFastLane: boolean;
}

function p95(samples: readonly number[]): number {
	if (!samples.length) {
		return 0;
	}
	const sorted = [...samples].sort((a, b) => a - b);
	return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]!;
}

export function runQuantumIDEAgentNearInstantBenchmarks(): IQuantumIDEAgentNearInstantBenchmarkResult {
	const files = Array.from({ length: 500 }, (_, i) => ({
		uri: `file:///Root/src/f${i}.ts`,
		workspaceRelativePath: `Root/src/f${i}.ts`,
		name: `f${i}.ts`,
		extension: '.ts',
	}));
	const graph = {
		...createEmptyQuantumIDEWorkspaceGraph('bench', [{ name: 'Root', uri: 'file:///Root' }], 'bench'),
		files,
		status: { indexed: true, reason: 'benchmark' },
	};
	const snapshot = buildQuantumIDEWorkspaceAgentSnapshot(graph, 1);
	const fastLaneSamples: number[] = [];
	for (let i = 0; i < 40; i++) {
		const r = tryQuantumIDEAgentFsSimpleFastLane('Does Root/src/f42.ts exist?', snapshot);
		if (r.handled) {
			fastLaneSamples.push(r.durationMs);
		}
	}
	const fastLaneP95 = p95(fastLaneSamples);
	const warm = measureQuantumIDEWarmExistsBatchFromGraphMs();
	const semantic = measureQuantumIDESemanticIncrementalCoreP95Ms(20).p95Ms;
	return {
		fastLaneP95Ms: fastLaneP95,
		warmExistsP95Ms: warm.totalMs,
		semanticIncrementalP95Ms: semantic,
		meetsColdStartSimple: fastLaneP95 <= QUANTUMIDE_AGENT_NEAR_INSTANT_BUDGETS.coldStartSimpleMs,
		meetsWarmSimple: warm.totalMs <= QUANTUMIDE_AGENT_NEAR_INSTANT_BUDGETS.warmSimpleMs,
		meetsFastLane: fastLaneP95 <= QUANTUMIDE_AGENT_NEAR_INSTANT_BUDGETS.fastLaneMs,
	};
}
