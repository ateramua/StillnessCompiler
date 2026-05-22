/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { isQuantumIDEPathIgnored, type IQuantumIDEWorkspaceIgnorePolicy } from './quantumideWorkspaceIgnore.js';
import {
	normalizeQuantumIDEStructurePath,
	type IQuantumIDEWorkspaceGraphStructureIndex,
} from './quantumideWorkspaceGraphStructureIndex.js';

export interface IQuantumIDEListWorkspaceDirectoryIndexResult {
	readonly lines: readonly string[];
	readonly truncated: boolean;
}

/**
 * Indexed `list_workspace_directory` hot path (FR-02-04): no IFileService directory walk.
 */
export function listWorkspaceDirectoryFromStructureIndex(
	index: IQuantumIDEWorkspaceGraphStructureIndex,
	pathArg: string,
	maxEntries: number,
	policy: IQuantumIDEWorkspaceIgnorePolicy,
): IQuantumIDEListWorkspaceDirectoryIndexResult {
	const normalizedDir = normalizeQuantumIDEStructurePath(pathArg);
	if (!index.pathExists(normalizedDir)) {
		throw new Error(`Path not found in workspace index: ${pathArg}`);
	}
	if (!index.isDirectory(normalizedDir)) {
		throw new Error(`Not a directory: ${pathArg}`);
	}
	const lines: string[] = [];
	let truncated = false;
	for (const child of index.listImmediateChildren(normalizedDir)) {
		if (lines.length >= maxEntries) {
			lines.push(`… truncated after ${maxEntries} entries`);
			truncated = true;
			break;
		}
		const rel = normalizedDir === '.'
			? child.name
			: `${normalizedDir}/${child.name}`;
		if (isQuantumIDEPathIgnored(rel, policy, 'ai', child.name)) {
			continue;
		}
		lines.push(`${child.kind === 'directory' ? '[dir]' : '[file]'} ${rel}`);
	}
	return { lines, truncated };
}

export function formatListWorkspaceDirectoryIndexResponse(
	pathArg: string,
	result: IQuantumIDEListWorkspaceDirectoryIndexResult,
): string {
	return result.lines.length
		? `Directory ${pathArg} (workspace index):\n\n${result.lines.join('\n')}`
		: `Directory ${pathArg} is empty (or all entries are ignored).`;
}
