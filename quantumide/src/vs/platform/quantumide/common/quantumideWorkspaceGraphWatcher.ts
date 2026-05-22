/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import type { IQuantumIDEFileNode, IQuantumIDEWorkspaceGraph } from './quantumideWorkspaceGraph.js';
import { isQuantumIDEWorkspaceGraphUntrusted } from './quantumideWorkspaceTrust.js';

/** Fast incremental ADD/UPDATE/DELETE patch (M-02). */
export const QUANTUMIDE_FILE_WATCHER_INCREMENTAL_DEBOUNCE_MS = 800;

/** Debounced full graph refresh after file watcher events (§11 acceptance: ≤3s). */
export const QUANTUMIDE_FILE_WATCHER_FULL_REFRESH_DEBOUNCE_MS = 3_000;

export const QUANTUMIDE_FILE_WATCHER_MAX_INCREMENTAL_CHANGES = 80;

export interface IQuantumIDEFileWatcherGraphPlan {
	readonly runIncremental: boolean;
	readonly runDebouncedFullRefresh: boolean;
}

/** Decide incremental patch vs debounced-only full refresh for a file watcher batch. */
export function planWorkspaceGraphFileWatcherRefresh(options: {
	readonly changeCount: number;
	readonly graph: IQuantumIDEWorkspaceGraph | undefined;
	readonly maxIncrementalChanges?: number;
}): IQuantumIDEFileWatcherGraphPlan {
	const max = options.maxIncrementalChanges ?? QUANTUMIDE_FILE_WATCHER_MAX_INCREMENTAL_CHANGES;
	if (options.changeCount <= 0) {
		return { runIncremental: false, runDebouncedFullRefresh: false };
	}
	const graph = options.graph;
	if (!graph?.status.indexed || isQuantumIDEWorkspaceGraphUntrusted(graph)) {
		return { runIncremental: false, runDebouncedFullRefresh: true };
	}
	if (options.changeCount > max) {
		return { runIncremental: false, runDebouncedFullRefresh: true };
	}
	// AC-01-02: successful incremental patches must not schedule a debounced full rescan per edit.
	return { runIncremental: true, runDebouncedFullRefresh: false };
}

/** AC-01-05: worst-case ms until graph reflects watcher create (debounced scheduler delay). */
export function computeQuantumIDEWatcherGraphVisibilityMs(plan: IQuantumIDEFileWatcherGraphPlan): number {
	if (plan.runIncremental) {
		return QUANTUMIDE_FILE_WATCHER_INCREMENTAL_DEBOUNCE_MS;
	}
	if (plan.runDebouncedFullRefresh) {
		return QUANTUMIDE_FILE_WATCHER_FULL_REFRESH_DEBOUNCE_MS;
	}
	return 0;
}

export function isQuantumIDEWatcherGraphVisibleWithinBudget(
	plan: IQuantumIDEFileWatcherGraphPlan,
	budgetMs: number = QUANTUMIDE_FILE_WATCHER_FULL_REFRESH_DEBOUNCE_MS,
): boolean {
	const delay = computeQuantumIDEWatcherGraphVisibilityMs(plan);
	return delay > 0 && delay <= budgetMs;
}

export interface IQuantumIDEWorkspaceGraphWatcherPatch {
	readonly added?: readonly IQuantumIDEFileNode[];
	readonly deletedUris?: readonly string[];
}

/**
 * Apply watcher ADD/DELETE to an indexed graph in memory (no IFileService). AC-01-05 harness.
 */
export function patchQuantumIDEWorkspaceGraphFromWatcher(
	graph: IQuantumIDEWorkspaceGraph,
	patch: IQuantumIDEWorkspaceGraphWatcherPatch,
): IQuantumIDEWorkspaceGraph {
	let files = [...graph.files];
	for (const uri of patch.deletedUris ?? []) {
		files = files.filter(f => f.uri !== uri);
	}
	for (const node of patch.added ?? []) {
		if (!files.some(f => f.uri === node.uri)) {
			files.push(node);
		}
	}
	const changeCount = (patch.added?.length ?? 0) + (patch.deletedUris?.length ?? 0);
	return {
		...graph,
		files,
		status: {
			...graph.status,
			generatedAt: new Date().toISOString(),
			reason: `incremental patch (${changeCount} change(s))`,
		},
	};
}

export function graphContainsWorkspacePath(graph: IQuantumIDEWorkspaceGraph, workspaceRelativePath: string): boolean {
	return graph.files.some(f => f.workspaceRelativePath === workspaceRelativePath);
}
