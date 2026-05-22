/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { QuantumIDEPrefixPathCache } from './quantumidePrefixPathCache.js';
import { QuantumIDEQueryResultCache } from './quantumideQueryResultCache.js';
import {
	estimateQuantumIDEWorkspaceCacheMemoryFromPaths,
	type IQuantumIDEWorkspaceCacheMemoryEstimate,
	QUANTUMIDE_DEFAULT_MEMORY_BUDGET_MB,
} from './quantumideWorkspaceMemoryBudget.js';

const l2PrefixCache = new QuantumIDEPrefixPathCache();
const l5QueryCache = new QuantumIDEQueryResultCache();

let graphGeneration = 0;
let lastBumpClearDurationMs = 0;
let memoryBudgetMb = QUANTUMIDE_DEFAULT_MEMORY_BUDGET_MB;
let lastMemoryEstimate: IQuantumIDEWorkspaceCacheMemoryEstimate | undefined;

export interface IQuantumIDEWorkspaceGraphGenerationBumpResult {
	readonly generation: number;
	readonly clearDurationMs: number;
	readonly l2PathCount: number;
	readonly l5EntryCount: number;
}

export function getQuantumIDEWorkspaceGraphGeneration(): number {
	return graphGeneration;
}

export function getQuantumIDEL2PrefixPathCache(): QuantumIDEPrefixPathCache {
	return l2PrefixCache;
}

export function getQuantumIDEL5QueryResultCache(): QuantumIDEQueryResultCache {
	return l5QueryCache;
}

export function getQuantumIDELastGraphGenerationBumpClearMs(): number {
	return lastBumpClearDurationMs;
}

export function getQuantumIDEMemoryBudgetMb(): number {
	return memoryBudgetMb;
}

export function setQuantumIDEMemoryBudgetMb(mb: number): void {
	memoryBudgetMb = Math.max(32, Math.min(4096, mb));
}

export function getQuantumIDELastWorkspaceCacheMemoryEstimate(): IQuantumIDEWorkspaceCacheMemoryEstimate | undefined {
	return lastMemoryEstimate;
}

/** MEM-04: track footprint; MEM-02: evict L5 then L2 basename index when over budget. */
export function reportQuantumIDEWorkspaceCacheMemory(paths: readonly string[]): IQuantumIDEWorkspaceCacheMemoryEstimate {
	const estimate = estimateQuantumIDEWorkspaceCacheMemoryFromPaths(paths, memoryBudgetMb);
	lastMemoryEstimate = estimate;
	enforceQuantumIDEMemoryBudget(estimate);
	return estimate;
}

function enforceQuantumIDEMemoryBudget(estimate: IQuantumIDEWorkspaceCacheMemoryEstimate): void {
	const budgetBytes = memoryBudgetMb * 1024 * 1024;
	if (estimate.totalBytes <= budgetBytes) {
		return;
	}
	l5QueryCache.clear();
	const afterL5 = estimateQuantumIDEWorkspaceCacheMemoryFromPaths(l2PrefixCache.paths, memoryBudgetMb);
	if (afterL5.totalBytes <= budgetBytes) {
		lastMemoryEstimate = afterL5;
		return;
	}
	l2PrefixCache.clearBasenameIndex();
	lastMemoryEstimate = estimateQuantumIDEWorkspaceCacheMemoryFromPaths(l2PrefixCache.paths, memoryBudgetMb);
}

/**
 * CACHE-02: L1 graph generation bump — synchronously invalidates L2 prefix + L5 query caches.
 */
export function bumpQuantumIDEWorkspaceGraphGeneration(l2Paths?: readonly string[]): IQuantumIDEWorkspaceGraphGenerationBumpResult {
	const clearStart = performance.now();
	graphGeneration++;
	l2PrefixCache.clear();
	l5QueryCache.clear();
	l5QueryCache.setGraphGeneration(graphGeneration);
	if (l2Paths !== undefined) {
		l2PrefixCache.set(graphGeneration, l2Paths);
		reportQuantumIDEWorkspaceCacheMemory(l2Paths);
	}
	const clearDurationMs = performance.now() - clearStart;
	lastBumpClearDurationMs = clearDurationMs;
	return {
		generation: graphGeneration,
		clearDurationMs,
		l2PathCount: l2PrefixCache.pathCount,
		l5EntryCount: l5QueryCache.size,
	};
}

/** Repopulate L2 after graph commit without bumping generation again. */
export function syncQuantumIDEL2PrefixCache(paths: readonly string[]): void {
	l2PrefixCache.set(graphGeneration, paths);
	reportQuantumIDEWorkspaceCacheMemory(paths);
}

export function resetQuantumIDEWorkspacePerformanceCoordinatorForTests(): void {
	graphGeneration = 0;
	lastBumpClearDurationMs = 0;
	memoryBudgetMb = QUANTUMIDE_DEFAULT_MEMORY_BUDGET_MB;
	lastMemoryEstimate = undefined;
	l2PrefixCache.clear();
	l5QueryCache.clear();
	l5QueryCache.setGraphGeneration(0);
}
