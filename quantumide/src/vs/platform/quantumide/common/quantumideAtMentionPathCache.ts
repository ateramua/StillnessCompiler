/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import {
	isQuantumIDEPathIgnored,
	mergeQuantumIDEIgnorePolicy,
	type IQuantumIDEWorkspaceIgnorePolicy,
} from './quantumideWorkspaceIgnore.js';
import {
	QuantumIDEWorkspaceIndexExcludeNames,
	type IQuantumIDEWorkspaceGraph,
} from './quantumideWorkspaceGraph.js';

/** Fast default policy for cold @ mention (no async ignore file reads). AC-01-03 */
export function createQuantumIDEAtMentionFastIgnorePolicy(
	extraSecretNames: readonly string[] = [],
): IQuantumIDEWorkspaceIgnorePolicy {
	return mergeQuantumIDEIgnorePolicy(
		QuantumIDEWorkspaceIndexExcludeNames,
		undefined,
		undefined,
		extraSecretNames,
	);
}

/**
 * Synchronous path list for @ mention from a hydrated workspace graph (storage cache / pre-lite-scan).
 */
export function buildQuantumIDEAtMentionPathsFromGraph(
	graph: IQuantumIDEWorkspaceGraph | undefined,
	policy: IQuantumIDEWorkspaceIgnorePolicy = createQuantumIDEAtMentionFastIgnorePolicy(),
): readonly string[] {
	if (!graph?.files.length) {
		return [];
	}
	const paths: string[] = [];
	for (const file of graph.files) {
		if (!isQuantumIDEPathIgnored(file.workspaceRelativePath, policy, 'ai', file.name)) {
			paths.push(file.workspaceRelativePath);
		}
	}
	return paths;
}

export function isQuantumIDEAtMentionGraphFromStorage(graph: IQuantumIDEWorkspaceGraph | undefined): boolean {
	if (!graph?.files.length) {
		return false;
	}
	const reason = graph.status.reason ?? '';
	return reason.includes('cache') || reason.includes('storage') || !reason.includes('lite snapshot');
}
