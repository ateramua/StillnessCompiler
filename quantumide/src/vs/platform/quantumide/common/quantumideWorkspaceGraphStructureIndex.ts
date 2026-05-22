/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import type { IQuantumIDEWorkspaceGraph } from './quantumideWorkspaceGraph.js';

export const QUANTUMIDE_STRUCTURE_INDEX_FILE = '.quantumide/structure-index.v1.json';

export interface IQuantumIDEStructureIndexSnapshot {
	readonly version: 1;
	readonly generatedAt: string;
	readonly paths: readonly string[];
}

export type QuantumIDEStructureEntryKind = 'file' | 'directory';

export interface IQuantumIDEStructureChildEntry {
	readonly name: string;
	readonly kind: QuantumIDEStructureEntryKind;
}

export interface IQuantumIDEWorkspaceGraphStructureIndex {
	readonly fileCount: number;
	readonly directoryCount: number;
	pathExists(workspaceRelativePath: string): boolean;
	isDirectory(workspaceRelativePath: string): boolean;
	listImmediateChildren(dirPath: string): readonly IQuantumIDEStructureChildEntry[];
}

/** Normalize workspace-relative paths for index keys (`./src` → `src`, `.` → `.`). */
export function normalizeQuantumIDEStructurePath(path: string): string {
	let p = path.replace(/\\/g, '/').trim();
	if (!p || p === '.') {
		return '.';
	}
	while (p.startsWith('./')) {
		p = p.slice(2);
	}
	return p.replace(/\/+$/, '');
}

function parentDirPath(normalizedFilePath: string): string {
	const slash = normalizedFilePath.lastIndexOf('/');
	if (slash < 0) {
		return '.';
	}
	return slash === 0 ? '.' : normalizedFilePath.slice(0, slash);
}

/**
 * In-memory structural index for O(1) exists / list_dir without filesystem walks (PF-01 / AC-01-01).
 */
export function buildQuantumIDEWorkspaceGraphStructureIndex(
	paths: readonly string[],
): IQuantumIDEWorkspaceGraphStructureIndex {
	const fileSet = new Set<string>();
	const directorySet = new Set<string>(['.']);
	const childrenByDir = new Map<string, Map<string, QuantumIDEStructureEntryKind>>();

	const ensureDir = (dir: string): Map<string, QuantumIDEStructureEntryKind> => {
		let map = childrenByDir.get(dir);
		if (!map) {
			map = new Map();
			childrenByDir.set(dir, map);
		}
		return map;
	};

	const addDirectoryChild = (dir: string, name: string): void => {
		const parent = normalizeQuantumIDEStructurePath(dir);
		directorySet.add(parent);
		const map = ensureDir(parent);
		const existing = map.get(name);
		if (existing === 'file') {
			return;
		}
		map.set(name, 'directory');
		const childDir = parent === '.' ? name : `${parent}/${name}`;
		directorySet.add(childDir);
		ensureDir(childDir);
	};

	for (const raw of paths) {
		const normalized = normalizeQuantumIDEStructurePath(raw);
		if (!normalized || normalized === '.') {
			continue;
		}
		fileSet.add(normalized);
		const parts = normalized.split('/');
		for (let i = 0; i < parts.length - 1; i++) {
			const dir = i === 0 ? '.' : parts.slice(0, i).join('/');
			const name = parts[i]!;
			addDirectoryChild(dir, name);
		}
		const fileDir = parentDirPath(normalized);
		const fileName = parts[parts.length - 1]!;
		const map = ensureDir(fileDir);
		map.set(fileName, 'file');
	}

	return {
		fileCount: fileSet.size,
		directoryCount: directorySet.size,
		pathExists(workspaceRelativePath: string): boolean {
			const p = normalizeQuantumIDEStructurePath(workspaceRelativePath);
			if (p === '.') {
				return true;
			}
			return fileSet.has(p) || directorySet.has(p);
		},
		isDirectory(workspaceRelativePath: string): boolean {
			const p = normalizeQuantumIDEStructurePath(workspaceRelativePath);
			if (p === '.') {
				return true;
			}
			if (fileSet.has(p)) {
				return false;
			}
			return directorySet.has(p);
		},
		listImmediateChildren(dirPath: string): readonly IQuantumIDEStructureChildEntry[] {
			const dir = normalizeQuantumIDEStructurePath(dirPath);
			if (!directorySet.has(dir)) {
				return [];
			}
			const map = childrenByDir.get(dir);
			if (!map || map.size === 0) {
				return [];
			}
			return [...map.entries()]
				.sort((a, b) => a[0].localeCompare(b[0]))
				.map(([name, kind]) => ({ name, kind }));
		},
	};
}

export function buildQuantumIDEWorkspaceGraphStructureIndexFromGraph(
	graph: IQuantumIDEWorkspaceGraph | undefined,
): IQuantumIDEWorkspaceGraphStructureIndex | undefined {
	if (!graph?.status.indexed || graph.files.length === 0) {
		return undefined;
	}
	return buildQuantumIDEWorkspaceGraphStructureIndex(graph.files.map(f => f.workspaceRelativePath));
}

export function createQuantumIDEStructureIndexSnapshot(paths: readonly string[]): IQuantumIDEStructureIndexSnapshot {
	return {
		version: 1,
		generatedAt: new Date().toISOString(),
		paths: [...paths],
	};
}

export function parseQuantumIDEStructureIndexSnapshot(raw: string): IQuantumIDEStructureIndexSnapshot | undefined {
	try {
		const parsed = JSON.parse(raw) as IQuantumIDEStructureIndexSnapshot;
		if (parsed.version !== 1 || !Array.isArray(parsed.paths)) {
			return undefined;
		}
		return parsed;
	} catch {
		return undefined;
	}
}

export function buildQuantumIDEWorkspaceGraphStructureIndexFromSnapshot(
	snapshot: IQuantumIDEStructureIndexSnapshot,
): IQuantumIDEWorkspaceGraphStructureIndex {
	return buildQuantumIDEWorkspaceGraphStructureIndex(snapshot.paths);
}
