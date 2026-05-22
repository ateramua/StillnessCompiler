/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/** CACHE-03: max L5 entries. */
export const QUANTUMIDE_QUERY_CACHE_MAX_ENTRIES = 500;

export const QUANTUMIDE_QUERY_CACHE_DEFAULT_TTL_SEC = 60;

export interface IQuantumIDEQueryCacheEntry {
	readonly generation: number;
	readonly createdAt: number;
	readonly hits: number;
	readonly key: string;
	readonly result: string;
}

/** L5 — rg / fuzzy / semantic tool result cache (generation + TTL). */
export class QuantumIDEQueryResultCache {
	private _graphGeneration = 0;
	private readonly _entries = new Map<string, IQuantumIDEQueryCacheEntry>();
	private _lruOrder: string[] = [];

	get graphGeneration(): number {
		return this._graphGeneration;
	}

	get size(): number {
		return this._entries.size;
	}

	/** Synchronous clear on graph generation bump (AC-04-01). */
	clear(): void {
		this._entries.clear();
		this._lruOrder = [];
	}

	setGraphGeneration(generation: number): void {
		this._graphGeneration = generation;
	}

	get(key: string, nowMs: number, ttlSec = QUANTUMIDE_QUERY_CACHE_DEFAULT_TTL_SEC): string | undefined {
		const entry = this._entries.get(key);
		if (!entry || entry.generation !== this._graphGeneration) {
			return undefined;
		}
		if (nowMs - entry.createdAt > ttlSec * 1000) {
			this.delete(key);
			return undefined;
		}
		const updated: IQuantumIDEQueryCacheEntry = {
			...entry,
			hits: entry.hits + 1,
		};
		this._entries.set(key, updated);
		this._touchLru(key);
		return updated.result;
	}

	set(key: string, result: string, nowMs: number = Date.now()): void {
		if (this._entries.has(key)) {
			this.delete(key);
		}
		while (this._entries.size >= QUANTUMIDE_QUERY_CACHE_MAX_ENTRIES && this._lruOrder.length > 0) {
			const oldest = this._lruOrder.shift()!;
			this._entries.delete(oldest);
		}
		this._entries.set(key, {
			generation: this._graphGeneration,
			createdAt: nowMs,
			hits: 0,
			key,
			result,
		});
		this._lruOrder.push(key);
	}

	private delete(key: string): void {
		this._entries.delete(key);
		const idx = this._lruOrder.indexOf(key);
		if (idx >= 0) {
			this._lruOrder.splice(idx, 1);
		}
	}

	private _touchLru(key: string): void {
		const idx = this._lruOrder.indexOf(key);
		if (idx >= 0) {
			this._lruOrder.splice(idx, 1);
		}
		this._lruOrder.push(key);
	}
}
