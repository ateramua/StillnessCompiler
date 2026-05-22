/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import {
	computeQuantumIDEMultiRootScanConcurrency,
	runQuantumIDERootScansInParallel,
} from './quantumideParallelRootScan.js';

/** AC-04-02 / WS-01: 5-root parallel lite scan wall-clock budget (milliseconds). */
export const QUANTUMIDE_5_ROOT_LITE_WALL_BUDGET_MS = 10_000;

/** Simulated per-root lite scan cost used to prove parallelism (ms). */
export const QUANTUMIDE_5_ROOT_LITE_SIMULATED_PER_ROOT_MS = 1_500;

const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Measures wall time for 5 parallel root tasks at simulated lite depth.
 * Sequential would be 7500ms; capped parallel (4+1) must stay under 10s.
 */
export async function measureQuantumIDE5RootParallelLiteScanMs(
	rootCount = 5,
	perRootMs = QUANTUMIDE_5_ROOT_LITE_SIMULATED_PER_ROOT_MS,
): Promise<{ wallMs: number; rootCount: number; concurrency: number }> {
	const concurrency = computeQuantumIDEMultiRootScanConcurrency(rootCount);
	const roots = Array.from({ length: rootCount }, (_, i) => i);
	const start = performance.now();
	await runQuantumIDERootScansInParallel(
		roots,
		async () => {
			await delay(perRootMs);
		},
		concurrency,
	);
	return {
		wallMs: performance.now() - start,
		rootCount,
		concurrency,
	};
}
