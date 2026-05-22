/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { QUANTUMIDE_LARGE_PATH_COUNT_THRESHOLD } from './quantumideWorkspaceMemoryBudget.js';

function buildCompactBasenameIndex(paths: readonly string[]): Map<string, Uint32Array> {
	const buckets = new Map<string, number[]>();
	for (let i = 0; i < paths.length; i++) {
		const base = paths[i]!.replace(/\\/g, '/').split('/').pop()?.toLowerCase() ?? '';
		if (!base) {
			continue;
		}
		const bucket = buckets.get(base) ?? [];
		bucket.push(i);
		buckets.set(base, bucket);
	}
	const index = new Map<string, Uint32Array>();
	for (const [base, indices] of buckets) {
		index.set(base, Uint32Array.from(indices));
	}
	return index;
}

/** L2 — @mention / fuzzy basename prefix index (PF-04 CACHE). */
export class QuantumIDEPrefixPathCache {
	private _generation = 0;
	private _paths: readonly string[] = [];
	private _basenameIndex = new Map<string, string[]>();
	private _basenameIndexCompact: Map<string, Uint32Array> | undefined;
	private _useCompactIndex = false;

	get generation(): number {
		return this._generation;
	}

	get pathCount(): number {
		return this._paths.length;
	}

	get basenameBucketCount(): number {
		return this._basenameIndex.size;
	}

	get paths(): readonly string[] {
		return this._paths;
	}

	get basenamePrefixIndex(): ReadonlyMap<string, readonly string[]> {
		return this._basenameIndex;
	}

	get usesCompactBasenameIndex(): boolean {
		return this._useCompactIndex;
	}

	/** Synchronous clear on graph generation bump (AC-04-01). */
	clear(): void {
		this._paths = [];
		this._basenameIndex.clear();
		this._basenameIndexCompact = undefined;
		this._useCompactIndex = false;
	}

	/** MEM-02: drop basename buckets under memory pressure; keep path list. */
	clearBasenameIndex(): void {
		this._basenameIndex.clear();
		this._basenameIndexCompact = undefined;
		this._useCompactIndex = false;
	}

	set(generation: number, paths: readonly string[]): void {
		this._generation = generation;
		this._paths = paths;
		if (paths.length > QUANTUMIDE_LARGE_PATH_COUNT_THRESHOLD) {
			this._useCompactIndex = true;
			this._basenameIndex = new Map();
			this._basenameIndexCompact = buildCompactBasenameIndex(paths);
			return;
		}
		this._useCompactIndex = false;
		this._basenameIndexCompact = undefined;
		const index = new Map<string, string[]>();
		for (const path of paths) {
			const base = path.replace(/\\/g, '/').split('/').pop()?.toLowerCase() ?? '';
			if (!base) {
				continue;
			}
			const bucket = index.get(base) ?? [];
			bucket.push(path);
			index.set(base, bucket);
		}
		this._basenameIndex = index;
	}

	resolvePathsForBasename(basenameLower: string): readonly string[] {
		if (this._useCompactIndex && this._basenameIndexCompact) {
			const indices = this._basenameIndexCompact.get(basenameLower);
			if (!indices) {
				return [];
			}
			const out: string[] = [];
			for (let i = 0; i < indices.length; i++) {
				out.push(this._paths[indices[i]!]!);
			}
			return out;
		}
		return this._basenameIndex.get(basenameLower) ?? [];
	}
}
