/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/** L0 stat/exists entry (PF-02 / FR-02-02). */
export interface IQuantumIDEWorkspaceStatCacheEntry {
	readonly exists: boolean;
	readonly isFile?: boolean;
	readonly isDirectory?: boolean;
	readonly generation: number;
}

/**
 * In-memory stat cache keyed by normalized workspace-relative path.
 * Invalidated when the workspace graph generation advances.
 */
export class QuantumIDEWorkspaceStatCache {
	private readonly _entries = new Map<string, IQuantumIDEWorkspaceStatCacheEntry>();
	private _generation = 0;

	get generation(): number {
		return this._generation;
	}

	bumpGeneration(): void {
		this._generation++;
		this._entries.clear();
	}

	get(path: string): IQuantumIDEWorkspaceStatCacheEntry | undefined {
		const entry = this._entries.get(path);
		if (!entry || entry.generation !== this._generation) {
			return undefined;
		}
		return entry;
	}

	set(path: string, entry: Omit<IQuantumIDEWorkspaceStatCacheEntry, 'generation'>): void {
		this._entries.set(path, { ...entry, generation: this._generation });
	}

	delete(path: string): void {
		this._entries.delete(path);
	}

	clear(): void {
		this._entries.clear();
	}
}
