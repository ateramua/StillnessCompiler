/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import type { IQuantumIDEWorkspaceGraph } from './quantumideWorkspaceGraph.js';
import { planWorkspaceGraphFileWatcherRefresh } from './quantumideWorkspaceGraphWatcher.js';

export interface IQuantumIDEWorkspaceGraphEditSessionPlan {
	readonly editCount: number;
	readonly fullRescanSchedules: number;
	readonly incrementalSchedules: number;
}

/**
 * AC-01-02: simulate single-file watcher batches during an editing session (no filesystem).
 * Returns how many debounced **full** rescans would be scheduled; must be ≤1 including initial open.
 */
export function planQuantumIDEWorkspaceGraphEditSession(options: {
	readonly graph: IQuantumIDEWorkspaceGraph;
	readonly editCount: number;
	readonly changesPerEdit?: number;
	readonly includeInitialFullRescan?: boolean;
	readonly maxIncrementalChanges?: number;
}): IQuantumIDEWorkspaceGraphEditSessionPlan {
	const changesPerEdit = options.changesPerEdit ?? 1;
	let fullRescanSchedules = options.includeInitialFullRescan !== false ? 1 : 0;
	let incrementalSchedules = 0;
	for (let i = 0; i < options.editCount; i++) {
		const plan = planWorkspaceGraphFileWatcherRefresh({
			changeCount: changesPerEdit,
			graph: options.graph,
			maxIncrementalChanges: options.maxIncrementalChanges,
		});
		if (plan.runDebouncedFullRefresh) {
			fullRescanSchedules++;
		}
		if (plan.runIncremental) {
			incrementalSchedules++;
		}
	}
	return {
		editCount: options.editCount,
		fullRescanSchedules,
		incrementalSchedules,
	};
}

/** AC-01-02 acceptance: ≤1 full rescan when 50 files are edited in a normal indexed session. */
export const QUANTUMIDE_EDIT_SESSION_MAX_FULL_RESCAN = 1;
export const QUANTUMIDE_EDIT_SESSION_ACCEPTANCE_EDIT_COUNT = 50;

export function isQuantumIDEEditSessionFullRescanAcceptable(
	plan: IQuantumIDEWorkspaceGraphEditSessionPlan,
	maxFullRescan = QUANTUMIDE_EDIT_SESSION_MAX_FULL_RESCAN,
): boolean {
	return plan.fullRescanSchedules <= maxFullRescan;
}
