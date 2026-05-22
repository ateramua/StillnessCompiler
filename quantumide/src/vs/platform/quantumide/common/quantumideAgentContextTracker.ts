/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/** Req-04: per-session loaded context tracking for delta fetches. */
export interface IQuantumIDEAgentContextEntry {
	readonly path: string;
	readonly fingerprint: string;
	readonly loadedAt: number;
}

export interface IQuantumIDEAgentContextTrackerState {
	readonly sessionId: string;
	readonly graphGeneration: number;
	readonly entries: readonly IQuantumIDEAgentContextEntry[];
	readonly recentPaths: readonly string[];
}

export class QuantumIDEAgentContextTracker {
	private _graphGeneration = 0;
	private readonly _entries = new Map<string, IQuantumIDEAgentContextEntry>();
	private readonly _recentPaths: string[] = [];
	private readonly _maxRecent = 32;

	constructor(readonly sessionId: string) { }

	get graphGeneration(): number {
		return this._graphGeneration;
	}

	setGraphGeneration(generation: number): void {
		if (generation !== this._graphGeneration) {
			this._graphGeneration = generation;
			this._entries.clear();
		}
	}

	recordLoaded(path: string, fingerprint: string): void {
		const normalized = path.replace(/\\/g, '/').replace(/^\.\//, '');
		this._entries.set(normalized, { path: normalized, fingerprint, loadedAt: Date.now() });
		this._touchRecent(normalized);
	}

	recordRecentPath(path: string): void {
		this._touchRecent(path.replace(/\\/g, '/').replace(/^\.\//, ''));
	}

	needsFetch(path: string, fingerprint: string): boolean {
		const normalized = path.replace(/\\/g, '/').replace(/^\.\//, '');
		const existing = this._entries.get(normalized);
		return !existing || existing.fingerprint !== fingerprint;
	}

	predictPrefetchPaths(limit = 8): readonly string[] {
		return this._recentPaths.slice(0, limit);
	}

	toState(): IQuantumIDEAgentContextTrackerState {
		return {
			sessionId: this.sessionId,
			graphGeneration: this._graphGeneration,
			entries: [...this._entries.values()],
			recentPaths: [...this._recentPaths],
		};
	}

	static fromState(state: IQuantumIDEAgentContextTrackerState): QuantumIDEAgentContextTracker {
		const tracker = new QuantumIDEAgentContextTracker(state.sessionId);
		tracker._graphGeneration = state.graphGeneration;
		for (const entry of state.entries) {
			tracker._entries.set(entry.path, entry);
		}
		for (const path of state.recentPaths) {
			tracker._touchRecent(path);
		}
		return tracker;
	}

	private _touchRecent(path: string): void {
		const idx = this._recentPaths.indexOf(path);
		if (idx >= 0) {
			this._recentPaths.splice(idx, 1);
		}
		this._recentPaths.unshift(path);
		if (this._recentPaths.length > this._maxRecent) {
			this._recentPaths.length = this._maxRecent;
		}
	}
}
