/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import type { IQuantumIDEWorkspaceGraph } from './quantumideWorkspaceGraph.js';
import {
	createQuantumIDEStructureIndexSnapshot,
	type IQuantumIDEStructureIndexSnapshot,
	QUANTUMIDE_STRUCTURE_INDEX_FILE,
} from './quantumideWorkspaceGraphStructureIndex.js';
import { getQuantumIDEWorkspaceGraphGeneration } from './quantumideWorkspacePerformanceCoordinator.js';

export const QUANTUMIDE_AGENT_SNAPSHOT_FILE = '.quantumide/agent-snapshot.v1.json';

/** Req-07/11: zero-copy-friendly session snapshot for agent host (paths + generation). */
export interface IQuantumIDEWorkspaceAgentSnapshot {
	readonly version: 1;
	readonly graphGeneration: number;
	readonly generatedAt: string;
	readonly workspaceId: string;
	readonly structureIndex: IQuantumIDEStructureIndexSnapshot;
	readonly rootNames: readonly string[];
	readonly fileCount: number;
}

export function buildQuantumIDEWorkspaceAgentSnapshot(
	graph: IQuantumIDEWorkspaceGraph,
	graphGeneration = getQuantumIDEWorkspaceGraphGeneration(),
): IQuantumIDEWorkspaceAgentSnapshot {
	const paths = graph.files.map(f => f.workspaceRelativePath);
	return {
		version: 1,
		graphGeneration,
		generatedAt: new Date().toISOString(),
		workspaceId: graph.workspaceId,
		structureIndex: createQuantumIDEStructureIndexSnapshot(paths),
		rootNames: graph.folders.map(f => f.name),
		fileCount: paths.length,
	};
}

export function parseQuantumIDEWorkspaceAgentSnapshot(raw: string): IQuantumIDEWorkspaceAgentSnapshot | undefined {
	try {
		const parsed = JSON.parse(raw) as IQuantumIDEWorkspaceAgentSnapshot;
		if (parsed?.version !== 1 || !parsed.structureIndex?.paths?.length) {
			return undefined;
		}
		return parsed;
	} catch {
		return undefined;
	}
}

export function serializeQuantumIDEWorkspaceAgentSnapshot(snapshot: IQuantumIDEWorkspaceAgentSnapshot): string {
	return JSON.stringify(snapshot);
}

/** Alias for structure index path used by legacy host loaders. */
export { QUANTUMIDE_STRUCTURE_INDEX_FILE };
