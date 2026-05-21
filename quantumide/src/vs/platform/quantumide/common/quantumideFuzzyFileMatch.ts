/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Lightweight fuzzy path matching for QuantumIDE parity file pickers.
 * Matches query as a subsequence over the path (case-insensitive) with
 * bonuses for matches after path separators.
 */

export interface IQuantumIDEFuzzyFileMatch {
	readonly path: string;
	readonly score: number;
	readonly highlights: [number, number][];
}

function normalizeQuery(query: string): string {
	return query.trim().toLowerCase().replace(/\\/g, '/');
}

function mergeAdjacentCharHits(hits: [number, number][]): [number, number][] {
	if (hits.length === 0) {
		return [];
	}
	const out: [number, number][] = [];
	let [curStart, curEnd] = hits[0];
	for (let i = 1; i < hits.length; i++) {
		const [s, e] = hits[i];
		if (s <= curEnd) {
			curEnd = e;
		} else {
			out.push([curStart, curEnd]);
			curStart = s;
			curEnd = e;
		}
	}
	out.push([curStart, curEnd]);
	return out;
}

function scoreSubsequence(needle: string, haystackLower: string, haystackRaw: string): { score: number; highlights: [number, number][] } | undefined {
	if (!needle.length) {
		return { score: 0, highlights: [] };
	}
	let qi = 0;
	let score = 0;
	const hits: [number, number][] = [];
	for (let i = 0; i < haystackLower.length && qi < needle.length; i++) {
		if (haystackLower[i] === needle[qi]) {
			const atBoundary = i === 0 || haystackRaw[i - 1] === '/' || haystackRaw[i - 1] === '\\';
			score += atBoundary ? 20 : 10;
			hits.push([i, i + 1]);
			qi++;
		}
	}
	if (qi !== needle.length) {
		return undefined;
	}
	return { score, highlights: mergeAdjacentCharHits(hits) };
}

/**
 * Returns the best fuzzy matches for `query` against `paths`, sorted by score descending.
 */
export function quantumideFuzzyMatchFilePaths(query: string, paths: readonly string[], maxResults = 80): IQuantumIDEFuzzyFileMatch[] {
	const q = normalizeQuery(query);
	if (!q.length) {
		return paths.slice(0, maxResults).map(path => ({ path, score: 1, highlights: [] as [number, number][] }));
	}
	const out: IQuantumIDEFuzzyFileMatch[] = [];
	for (const path of paths) {
		const hay = path.replace(/\\/g, '/');
		const lower = hay.toLowerCase();
		const res = scoreSubsequence(q, lower, hay);
		if (res) {
			out.push({ path, score: res.score, highlights: res.highlights });
		}
	}
	out.sort((a, b) => b.score - a.score);
	return out.slice(0, maxResults);
}
