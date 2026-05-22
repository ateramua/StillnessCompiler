/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import type { IQuantumIDEWorkspaceGraph } from './quantumideWorkspaceGraph.js';
import {
	buildQuantumIDEWorkspaceGraphStructureIndexFromGraph,
	type IQuantumIDEStructureChildEntry,
	type IQuantumIDEWorkspaceGraphStructureIndex,
} from './quantumideWorkspaceGraphStructureIndex.js';
import { recordQuantumIDEFastPathHit, recordQuantumIDEFastPathMiss } from './quantumidePerfTelemetry.js';
import { QuantumIDEWorkspaceStatCache, type IQuantumIDEWorkspaceStatCacheEntry } from './quantumideWorkspaceStatCache.js';

export const QUANTUMIDE_FS_FAST_PATH_SETTING = 'quantumide.fs.fastPath.enabled';

/** Normalize workspace-relative paths for Set/Map lookups (no I/O). */
export function normalizeQuantumIDEWorkspaceFastPath(pathArg: string): string {
	return pathArg.trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
}

export interface IQuantumIDEFastPathExistsResult {
	readonly exists: boolean;
	readonly isFile?: boolean;
	readonly isDirectory?: boolean;
	/** True when answered from graph or L0 cache without IFileService. */
	readonly hit: boolean;
	/** True when the answer may be stale and async hydration is recommended. */
	readonly stale?: boolean;
}

export interface IQuantumIDEFastPathStatResult extends IQuantumIDEFastPathExistsResult {
	readonly size?: number;
}

export interface IQuantumIDEWorkspaceFastPathCounters {
	readonly hits: number;
	readonly misses: number;
}

/**
 * Sync workspace stat/exists layer backed by the indexed graph (PF-02 FR-02-01).
 * IFileService is not used on the hot path when the graph is warm.
 */
export class QuantumIDEWorkspaceFastPath {
	private _enabled = true;
	private _graphGeneration = 0;
	private readonly _filePaths = new Set<string>();
	private readonly _dirPaths = new Set<string>();
	private _structureIndex: IQuantumIDEWorkspaceGraphStructureIndex | undefined;
	private readonly _statCache = new QuantumIDEWorkspaceStatCache();
	private _hits = 0;
	private _misses = 0;

	get counters(): IQuantumIDEWorkspaceFastPathCounters {
		return { hits: this._hits, misses: this._misses };
	}

	setEnabled(enabled: boolean): void {
		this._enabled = enabled;
	}

	isEnabled(): boolean {
		return this._enabled;
	}

	get graphGeneration(): number {
		return this._graphGeneration;
	}

	/** Rebuild path indexes from a workspace graph snapshot (warm). */
	warmFromGraph(graph: IQuantumIDEWorkspaceGraph): void {
		this._graphGeneration++;
		this._statCache.bumpGeneration();
		this._filePaths.clear();
		this._dirPaths.clear();
		this._structureIndex = buildQuantumIDEWorkspaceGraphStructureIndexFromGraph(graph);
		for (const file of graph.files) {
			const path = normalizeQuantumIDEWorkspaceFastPath(file.workspaceRelativePath);
			if (!path) {
				continue;
			}
			this._filePaths.add(path);
			this._addParentDirectories(path);
		}
		for (const folder of graph.folders) {
			const name = normalizeQuantumIDEWorkspaceFastPath(folder.name);
			if (name) {
				this._dirPaths.add(name);
			}
		}
	}

	exists(pathArg: string): IQuantumIDEFastPathExistsResult {
		return this._resolve(pathArg, false);
	}

	stat(pathArg: string): IQuantumIDEFastPathStatResult {
		return this._resolve(pathArg, true);
	}

	/** FR-02-01: immediate children from warmed structure index (no IFileService). */
	listImmediateChildren(dirPath: string): readonly IQuantumIDEStructureChildEntry[] {
		if (!this._enabled || !this._structureIndex) {
			this._recordMiss();
			return [];
		}
		this._recordHit();
		return this._structureIndex.listImmediateChildren(dirPath);
	}

	resetCounters(): void {
		this._hits = 0;
		this._misses = 0;
	}

	private _recordHit(): void {
		this._hits++;
		recordQuantumIDEFastPathHit();
	}

	private _recordMiss(): void {
		this._misses++;
		recordQuantumIDEFastPathMiss();
	}

	private _resolve(pathArg: string, asStat: boolean): IQuantumIDEFastPathStatResult {
		if (!this._enabled) {
			this._recordMiss();
			return { exists: false, hit: false, stale: true };
		}
		const path = normalizeQuantumIDEWorkspaceFastPath(pathArg);
		if (!path) {
			this._recordMiss();
			return { exists: false, hit: false, stale: true };
		}

		const cached = this._statCache.get(path);
		if (cached) {
			this._recordHit();
			return this._fromCacheEntry(cached);
		}

		if (this._filePaths.has(path)) {
			this._recordHit();
			const entry: Omit<IQuantumIDEWorkspaceStatCacheEntry, 'generation'> = {
				exists: true,
				isFile: true,
			};
			this._statCache.set(path, entry);
			return asStat ? { ...entry, hit: true } : { exists: true, isFile: true, hit: true };
		}

		if (this._dirPaths.has(path)) {
			this._recordHit();
			const entry: Omit<IQuantumIDEWorkspaceStatCacheEntry, 'generation'> = {
				exists: true,
				isDirectory: true,
			};
			this._statCache.set(path, entry);
			return asStat ? { ...entry, hit: true } : { exists: true, isDirectory: true, hit: true };
		}

		this._recordMiss();
		return { exists: false, hit: false, stale: true };
	}

	private _fromCacheEntry(entry: IQuantumIDEWorkspaceStatCacheEntry): IQuantumIDEFastPathStatResult {
		return {
			exists: entry.exists,
			isFile: entry.isFile,
			isDirectory: entry.isDirectory,
			hit: true,
		};
	}

	private _addParentDirectories(filePath: string): void {
		const parts = filePath.split('/');
		for (let i = 1; i < parts.length; i++) {
			this._dirPaths.add(parts.slice(0, i).join('/'));
		}
	}
}
