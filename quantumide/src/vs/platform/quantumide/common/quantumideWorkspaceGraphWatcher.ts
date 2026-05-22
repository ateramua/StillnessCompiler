/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import type { IQuantumIDEWorkspaceGraph } from './quantumideWorkspaceGraph.js';
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
	return { runIncremental: true, runDebouncedFullRefresh: true };
}
