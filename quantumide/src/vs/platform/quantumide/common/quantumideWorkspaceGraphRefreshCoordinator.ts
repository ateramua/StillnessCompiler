/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import type { IQuantumIDEWorkspaceGraph } from './quantumideWorkspaceGraph.js';

export type QuantumIDEWorkspaceGraphMutationKind = 'full' | 'incremental';

export interface IQuantumIDEWorkspaceGraphMutationLease {
	readonly kind: QuantumIDEWorkspaceGraphMutationKind;
	readonly mutationEpoch: number;
	readonly graphGenerationAtAcquire: number;
}

let fullRefreshLease: { readonly mutationEpoch: number } | undefined;
let incrementalPatchInFlight = false;
let mutationEpoch = 0;

export function resetQuantumIDEWorkspaceGraphRefreshCoordinatorForTests(): void {
	fullRefreshLease = undefined;
	incrementalPatchInFlight = false;
	mutationEpoch = 0;
}

export function isQuantumIDEWorkspaceGraphFullRefreshInFlight(): boolean {
	return fullRefreshLease !== undefined;
}

export function isQuantumIDEWorkspaceGraphIncrementalPatchInFlight(): boolean {
	return incrementalPatchInFlight;
}

/** CON-05: exclusive full refresh — blocks concurrent incremental patches. */
export function acquireQuantumIDEWorkspaceGraphFullRefresh(graphGeneration: number): IQuantumIDEWorkspaceGraphMutationLease {
	mutationEpoch++;
	fullRefreshLease = { mutationEpoch };
	return {
		kind: 'full',
		mutationEpoch,
		graphGenerationAtAcquire: graphGeneration,
	};
}

export function releaseQuantumIDEWorkspaceGraphFullRefresh(lease: IQuantumIDEWorkspaceGraphMutationLease): void {
	if (fullRefreshLease?.mutationEpoch === lease.mutationEpoch) {
		fullRefreshLease = undefined;
	}
}

/** Returns undefined when a full refresh is in flight or another patch is running. */
export function tryAcquireQuantumIDEWorkspaceGraphIncrementalPatch(
	graphGeneration: number,
): IQuantumIDEWorkspaceGraphMutationLease | undefined {
	if (fullRefreshLease || incrementalPatchInFlight) {
		return undefined;
	}
	incrementalPatchInFlight = true;
	mutationEpoch++;
	return {
		kind: 'incremental',
		mutationEpoch,
		graphGenerationAtAcquire: graphGeneration,
	};
}

export function releaseQuantumIDEWorkspaceGraphIncrementalPatch(lease: IQuantumIDEWorkspaceGraphMutationLease): void {
	if (lease.kind === 'incremental') {
		incrementalPatchInFlight = false;
	}
}

/**
 * AC-04-05: discard incremental results when full refresh committed a newer graph/generation.
 */
export function shouldCommitQuantumIDEWorkspaceGraphIncrementalPatch(
	lease: IQuantumIDEWorkspaceGraphMutationLease,
	graphAtPatchStart: IQuantumIDEWorkspaceGraph | undefined,
	graphNow: IQuantumIDEWorkspaceGraph | undefined,
	generationNow: number,
): boolean {
	if (lease.kind !== 'incremental') {
		return false;
	}
	if (fullRefreshLease) {
		return false;
	}
	if (lease.graphGenerationAtAcquire !== generationNow) {
		return false;
	}
	if (graphAtPatchStart !== graphNow) {
		return false;
	}
	return true;
}
