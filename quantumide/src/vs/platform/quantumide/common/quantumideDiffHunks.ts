/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

export interface IQuantumIDEDiffHunk {
	readonly index: number;
	readonly originalStart: number;
	readonly originalLines: readonly string[];
	readonly proposedLines: readonly string[];
}

/** Line-based diff hunks for partial acceptance (§2.5, §2.8). */
export function computeLineDiffHunks(original: string, proposed: string): IQuantumIDEDiffHunk[] {
	const a = original.split(/\r?\n/);
	const b = proposed.split(/\r?\n/);
	const hunks: IQuantumIDEDiffHunk[] = [];
	let i = 0;
	let j = 0;
	let hunkIndex = 0;
	while (i < a.length || j < b.length) {
		if (i < a.length && j < b.length && a[i] === b[j]) {
			i++;
			j++;
			continue;
		}
		const startI = i;
		const startJ = j;
		while (i < a.length && (j >= b.length || a[i] !== b[j])) {
			i++;
		}
		while (j < b.length && (i >= a.length || a[i] !== b[j])) {
			j++;
		}
		hunks.push({
			index: hunkIndex++,
			originalStart: startI,
			originalLines: a.slice(startI, i),
			proposedLines: b.slice(startJ, j),
		});
	}
	return hunks;
}

export function applyHunkToText(fullOriginal: string, hunks: readonly IQuantumIDEDiffHunk[], hunkIndex: number): string | undefined {
	const hunk = hunks.find(h => h.index === hunkIndex);
	if (!hunk) {
		return undefined;
	}
	const lines = fullOriginal.split(/\r?\n/);
	const before = lines.slice(0, hunk.originalStart);
	const after = lines.slice(hunk.originalStart + hunk.originalLines.length);
	return [...before, ...hunk.proposedLines, ...after].join('\n');
}

/** Unified diff text for §2.8 diff rendering (original → proposed). */
export function buildUnifiedDiffText(originalPath: string, proposedPath: string, original: string, proposed: string): string {
	const hunks = computeLineDiffHunks(original, proposed);
	const lines: string[] = [`--- ${originalPath}`, `+++ ${proposedPath}`];
	for (const hunk of hunks) {
		lines.push(`@@ -${hunk.originalStart + 1},${hunk.originalLines.length} +${hunk.originalStart + 1},${hunk.proposedLines.length} @@`);
		for (const line of hunk.originalLines) {
			lines.push(`-${line}`);
		}
		for (const line of hunk.proposedLines) {
			lines.push(`+${line}`);
		}
	}
	return lines.join('\n');
}

export function mergeTextWithAcceptedHunks(original: string, proposed: string, acceptedHunkIndices: ReadonlySet<number>): string {
	const hunks = computeLineDiffHunks(original, proposed);
	if (hunks.length === 0) {
		return proposed;
	}
	let lines = original.split(/\r?\n/);
	let offset = 0;
	for (const hunk of hunks) {
		if (!acceptedHunkIndices.has(hunk.index)) {
			continue;
		}
		const at = hunk.originalStart + offset;
		lines = [
			...lines.slice(0, at),
			...hunk.proposedLines,
			...lines.slice(at + hunk.originalLines.length),
		];
		offset += hunk.proposedLines.length - hunk.originalLines.length;
	}
	return lines.join('\n');
}
