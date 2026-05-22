/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/** MEM-04 / SC-01 / AC-04-03 default workspace RAM budget (megabytes). */
export const QUANTUMIDE_DEFAULT_MEMORY_BUDGET_MB = 512;

/** MEM-03: compact basename index above this path count. */
export const QUANTUMIDE_LARGE_PATH_COUNT_THRESHOLD = 50_000;

export interface IQuantumIDEWorkspaceCacheMemoryEstimate {
	readonly pathCount: number;
	readonly pathsBytes: number;
	readonly structureIndexBytes: number;
	readonly prefixCacheBytes: number;
	readonly totalBytes: number;
	readonly totalMb: number;
}

export function getQuantumIDEMemoryBudgetBytes(memoryBudgetMb = QUANTUMIDE_DEFAULT_MEMORY_BUDGET_MB): number {
	return Math.max(32, memoryBudgetMb) * 1024 * 1024;
}

/** Conservative UTF-16 + V8 string object overhead per path entry. */
export function estimateQuantumIDEPathArrayBytes(paths: readonly string[]): number {
	let charCount = 0;
	for (const p of paths) {
		charCount += p.length;
	}
	return charCount * 2 + paths.length * 40;
}

export function estimateQuantumIDEStructureIndexBytes(pathCount: number, avgPathChars: number): number {
	const perFileEntry = avgPathChars * 2 + 48;
	const directoryFactor = 1.35;
	return Math.ceil(pathCount * perFileEntry * directoryFactor);
}

export function estimateQuantumIDEPrefixCacheBytes(pathCount: number, pathsBytes: number, compact: boolean): number {
	if (pathCount === 0) {
		return 0;
	}
	if (compact) {
		return pathsBytes + pathCount * 4 + Math.min(pathCount, 4096) * 64;
	}
	return Math.ceil(pathsBytes * 1.6);
}

export function estimateQuantumIDEWorkspaceCacheMemoryFromPaths(
	paths: readonly string[],
	memoryBudgetMb = QUANTUMIDE_DEFAULT_MEMORY_BUDGET_MB,
): IQuantumIDEWorkspaceCacheMemoryEstimate {
	const pathCount = paths.length;
	const pathsBytes = estimateQuantumIDEPathArrayBytes(paths);
	const avgChars = pathCount > 0 ? pathsBytes / (pathCount * 2) : 0;
	const structureIndexBytes = estimateQuantumIDEStructureIndexBytes(pathCount, avgChars);
	const prefixCacheBytes = estimateQuantumIDEPrefixCacheBytes(
		pathCount,
		pathsBytes,
		pathCount > QUANTUMIDE_LARGE_PATH_COUNT_THRESHOLD,
	);
	const totalBytes = pathsBytes + structureIndexBytes + prefixCacheBytes;
	return {
		pathCount,
		pathsBytes,
		structureIndexBytes,
		prefixCacheBytes,
		totalBytes,
		totalMb: totalBytes / (1024 * 1024),
	};
}

export function isQuantumIDEWorkspaceCacheWithinMemoryBudget(
	estimate: IQuantumIDEWorkspaceCacheMemoryEstimate,
	memoryBudgetMb = QUANTUMIDE_DEFAULT_MEMORY_BUDGET_MB,
): boolean {
	return estimate.totalBytes <= getQuantumIDEMemoryBudgetBytes(memoryBudgetMb);
}

export function measureQuantumIDEHeapDeltaBytes(run: () => void): number {
	const g = globalThis as { gc?: () => void };
	g.gc?.();
	const before = process.memoryUsage().heapUsed;
	run();
	g.gc?.();
	return Math.max(0, process.memoryUsage().heapUsed - before);
}
