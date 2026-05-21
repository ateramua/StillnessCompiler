/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import type { IQuantumIDEDependencyGraph } from './quantumideDependencyGraph.js';
import type { IQuantumIDEWorkspaceEdit } from './quantumideWorkspaceEdits.js';

export interface IQuantumIDEEditConflict {
	readonly path: string;
	readonly reason: string;
}

/** Detect overlapping writes and duplicate paths (§2.4). */
export function detectEditConflicts(edits: readonly IQuantumIDEWorkspaceEdit[]): IQuantumIDEEditConflict[] {
	const conflicts: IQuantumIDEEditConflict[] = [];
	const seen = new Map<string, number>();
	for (let i = 0; i < edits.length; i++) {
		const edit = edits[i];
		const prior = seen.get(edit.path);
		if (prior !== undefined) {
			conflicts.push({ path: edit.path, reason: `Duplicate edit at indices ${prior} and ${i}` });
		}
		seen.set(edit.path, i);
		if (edit.operation === 'delete' && (edit.content?.length ?? 0) > 0) {
			conflicts.push({ path: edit.path, reason: 'Delete operation must not include content' });
		}
	}
	return conflicts;
}

/** Suggest files that may need updates when a path changes (§2.4 dependency propagation). */
export function suggestDependentPaths(
	graph: IQuantumIDEDependencyGraph | undefined,
	changedPath: string,
	maxResults = 20,
): string[] {
	if (!graph) {
		return [];
	}
	const normalized = changedPath.replace(/\\/g, '/');
	const baseName = normalized.split('/').pop() ?? normalized;
	const suggestions = new Set<string>();
	for (const node of graph.nodes) {
		if (node.id === `file:${normalized}`) {
			continue;
		}
		for (const dep of node.dependencies) {
			if (dep.includes(baseName) || dep.includes(normalized)) {
				if (node.kind === 'file') {
					suggestions.add(node.label);
				}
			}
		}
	}
	return [...suggestions].slice(0, maxResults);
}

/** Preserve trailing newline style when rewriting full file content. */
export function preserveFormattingStyle(priorContent: string, nextContent: string): string {
	if (priorContent.endsWith('\n') && !nextContent.endsWith('\n')) {
		return `${nextContent}\n`;
	}
	if (!priorContent.endsWith('\n') && nextContent.endsWith('\n') && nextContent.length > 1) {
		return nextContent.replace(/\n$/, '');
	}
	return nextContent;
}
