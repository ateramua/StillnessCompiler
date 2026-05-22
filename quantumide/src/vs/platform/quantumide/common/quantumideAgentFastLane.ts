/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import {
	buildQuantumIDEWorkspaceGraphStructureIndexFromSnapshot,
	type IQuantumIDEWorkspaceGraphStructureIndex,
} from './quantumideWorkspaceGraphStructureIndex.js';
import { normalizeQuantumIDEWorkspaceFastPath } from './quantumideWorkspaceFastPath.js';
import { classifyQuantumIDEAgentIntent } from './quantumideAgentIntentClassifier.js';
import type { IQuantumIDEWorkspaceAgentSnapshot } from './quantumideWorkspaceSnapshotBridge.js';

export interface IQuantumIDEAgentFastLaneResult {
	readonly handled: boolean;
	readonly response?: string;
	readonly durationMs: number;
}

const PATH_EXTRACT = /[`'"]?([^\s`'"]+\.[a-zA-Z0-9]+)[`'"]?/i;
const DIR_LIST_PATTERN = /\b(list|show)\s+(the\s+)?(files\s+in|directory|folder|dir)\s+[`'"]?([^`'"]+)[`'"]?/i;
const EXISTS_PATTERN = /\b(does|do|is|are|check\s+if|exists?)\b/i;

function structureIndexFromSnapshot(
	snapshot: IQuantumIDEWorkspaceAgentSnapshot | undefined,
): IQuantumIDEWorkspaceGraphStructureIndex | undefined {
	if (!snapshot?.structureIndex?.paths?.length) {
		return undefined;
	}
	return buildQuantumIDEWorkspaceGraphStructureIndexFromSnapshot(snapshot.structureIndex);
}

/** Req-05: bypass LLM for high-confidence fs_simple when snapshot is warm. */
export function tryQuantumIDEAgentFsSimpleFastLane(
	userMessage: string,
	snapshot: IQuantumIDEWorkspaceAgentSnapshot | undefined,
): IQuantumIDEAgentFastLaneResult {
	const start = performance.now();
	const classification = classifyQuantumIDEAgentIntent(userMessage);
	if (classification.intent !== 'fs_simple' || classification.confidence !== 'high') {
		return { handled: false, durationMs: performance.now() - start };
	}
	const index = structureIndexFromSnapshot(snapshot);
	if (!index) {
		return { handled: false, durationMs: performance.now() - start };
	}
	const text = userMessage.trim();
	const dirMatch = text.match(DIR_LIST_PATTERN);
	if (dirMatch) {
		const dir = normalizeQuantumIDEWorkspaceFastPath(dirMatch[4] ?? '.');
		const children = index.listImmediateChildren(dir === '' ? '.' : dir);
		const lines = children.slice(0, 40).map(c => `${c.kind === 'directory' ? '[dir]' : '[file]'} ${c.name}`);
		const body = lines.length
			? `Directory \`${dir}\` (${children.length} entries, showing ${lines.length}):\n\n${lines.join('\n')}`
			: `Directory \`${dir}\` is empty or not indexed.`;
		return { handled: true, response: body, durationMs: performance.now() - start };
	}
	if (EXISTS_PATTERN.test(text)) {
		const pathMatch = text.match(PATH_EXTRACT);
		if (pathMatch) {
			const rel = normalizeQuantumIDEWorkspaceFastPath(pathMatch[1]!);
			const exists = index.pathExists(rel);
			const isDir = exists && index.isDirectory(rel);
			const kind = !exists ? 'not found in the workspace index' : isDir ? 'a directory' : 'a file';
			return {
				handled: true,
				response: `\`${rel}\` is ${kind} (graph generation ${snapshot!.graphGeneration}).`,
				durationMs: performance.now() - start,
			};
		}
	}
	return { handled: false, durationMs: performance.now() - start };
}
