/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import type { IQuantumIDEWorkspaceGraph } from './quantumideWorkspaceGraph.js';
import { QuantumIDEWorkspaceFastPath } from './quantumideWorkspaceFastPath.js';
import { QuantumIDEQueryResultCache } from './quantumideQueryResultCache.js';

/** Req-02: pre-warm fast path + query cache from recent paths on startup. */
export function prewarmQuantumIDEWorkspaceCaches(
	graph: IQuantumIDEWorkspaceGraph,
	recentPaths: readonly string[],
	fastPath = new QuantumIDEWorkspaceFastPath(),
	queryCache = new QuantumIDEQueryResultCache(),
): { readonly fastPath: QuantumIDEWorkspaceFastPath; readonly queryCache: QuantumIDEQueryResultCache } {
	fastPath.warmFromGraph(graph);
	for (const path of recentPaths.slice(0, 24)) {
		fastPath.exists(path);
	}
	queryCache.setGraphGeneration(0);
	return { fastPath, queryCache };
}
