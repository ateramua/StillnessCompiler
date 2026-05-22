/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/** CON-01: max concurrent root scans (lite/full). */
export const QUANTUMIDE_PARALLEL_ROOT_SCAN_MAX_CONCURRENCY = 4;

export function computeQuantumIDEMultiRootScanConcurrency(rootCount: number): number {
	return Math.min(Math.max(1, rootCount), QUANTUMIDE_PARALLEL_ROOT_SCAN_MAX_CONCURRENCY);
}

/**
 * Runs one async task per root with bounded parallelism (`min(roots, 4)`).
 * Result order matches `roots` order.
 */
export async function runQuantumIDERootScansInParallel<TRoot, TResult>(
	roots: readonly TRoot[],
	scanRoot: (root: TRoot) => Promise<TResult>,
	concurrency = computeQuantumIDEMultiRootScanConcurrency(roots.length),
): Promise<readonly TResult[]> {
	if (roots.length === 0) {
		return [];
	}
	const results: TResult[] = new Array(roots.length);
	let nextIndex = 0;
	const workerCount = Math.min(concurrency, roots.length);
	const workers = Array.from({ length: workerCount }, async () => {
		while (true) {
			const index = nextIndex++;
			if (index >= roots.length) {
				break;
			}
			results[index] = await scanRoot(roots[index]!);
		}
	});
	await Promise.all(workers);
	return results;
}
