/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/** Defer first vector index pass after workspace open (M-32). */
export const QUANTUMIDE_VECTOR_INDEX_OPEN_PROJECT_DEFER_MS = 10_000;

/** Periodic full re-sync interval (Cursor-class ~5 min, M-32). */
export const QUANTUMIDE_VECTOR_INDEX_PERIODIC_SYNC_MS = 5 * 60_000;

/** Ordered pipeline phases: open project → scan → chunk → embed → store → periodic sync. */
export const QUANTUMIDE_VECTOR_INDEX_WORKFLOW_PHASES = [
	'open-project',
	'scan',
	'chunk',
	'embed',
	'store',
	'sync',
] as const;

export type QuantumIDEVectorIndexWorkflowPhase = typeof QUANTUMIDE_VECTOR_INDEX_WORKFLOW_PHASES[number];

export function isQuantumIDEVectorIndexPeriodicSyncReason(reason: string): boolean {
	return reason === 'periodic-sync-5m' || reason.startsWith('periodic-sync');
}
