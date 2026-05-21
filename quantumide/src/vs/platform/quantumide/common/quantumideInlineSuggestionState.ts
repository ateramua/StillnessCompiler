/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

export type QuantumIDEInlineHunkDisposition = 'pending' | 'accepted' | 'rejected';

export interface IQuantumIDEInlineSuggestionStateSnapshot {
	readonly proposalId: string;
	readonly hunks: readonly { index: number; disposition: QuantumIDEInlineHunkDisposition }[];
	readonly bulkAccepted: boolean;
	readonly bulkRejected: boolean;
}

export function buildInlineHunkDispositions(
	hunkCount: number,
	accepted: ReadonlySet<number>,
	rejected: ReadonlySet<number>,
): readonly { index: number; disposition: QuantumIDEInlineHunkDisposition }[] {
	const out: { index: number; disposition: QuantumIDEInlineHunkDisposition }[] = [];
	for (let i = 0; i < hunkCount; i++) {
		let disposition: QuantumIDEInlineHunkDisposition = 'pending';
		if (accepted.has(i)) {
			disposition = 'accepted';
		} else if (rejected.has(i)) {
			disposition = 'rejected';
		}
		out.push({ index: i, disposition });
	}
	return out;
}

export function allHunksAccepted(hunkCount: number, accepted: ReadonlySet<number>): boolean {
	return hunkCount > 0 && accepted.size >= hunkCount;
}

export function remainingPendingHunkIndices(
	hunkCount: number,
	accepted: ReadonlySet<number>,
	rejected: ReadonlySet<number>,
): number[] {
	const pending: number[] = [];
	for (let i = 0; i < hunkCount; i++) {
		if (!accepted.has(i) && !rejected.has(i)) {
			pending.push(i);
		}
	}
	return pending;
}
