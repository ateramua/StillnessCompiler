/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import type { IQuantumIDEWorkspaceGraph } from './quantumideWorkspaceGraph.js';

/** Default lite graph caps (must match workbench workspace context service). */
export const QUANTUMIDE_LITE_GRAPH_MAX_FILES = 120;
export const QUANTUMIDE_LITE_GRAPH_MIN_FILES_PER_ROOT = 8;
export const QUANTUMIDE_LITE_GRAPH_MAX_DEPTH = 2;

/** §11: budget so each of `rootCount` roots gets at least one top-level scan slice. */
export function computeQuantumIDELiteGraphPerRootBudget(rootCount: number): number {
	return Math.max(
		QUANTUMIDE_LITE_GRAPH_MIN_FILES_PER_ROOT,
		Math.floor(QUANTUMIDE_LITE_GRAPH_MAX_FILES / Math.max(1, rootCount)),
	);
}

export function computeQuantumIDELiteGraphEffectiveMaxFiles(rootCount: number): number {
	const perRoot = computeQuantumIDELiteGraphPerRootBudget(rootCount);
	return Math.max(QUANTUMIDE_LITE_GRAPH_MAX_FILES, rootCount * perRoot);
}

/** Max ms from workbench open until first lite refresh is scheduled (2s defer + 1.5s debounce). */
export const QUANTUMIDE_LITE_GRAPH_MULTI_ROOT_SCHEDULE_MS = 3_500;

export function hasQuantumIDETopLevelEntryForRoot(
	graph: IQuantumIDEWorkspaceGraph,
	folderName: string,
): boolean {
	const prefix = `${folderName}/`;
	for (const file of graph.files) {
		if (!file.workspaceRelativePath.startsWith(prefix)) {
			continue;
		}
		const rest = file.workspaceRelativePath.slice(prefix.length);
		if (rest.length > 0 && !rest.includes('/')) {
			return true;
		}
	}
	for (const manifest of graph.manifests) {
		if (manifest.workspaceRelativePath.startsWith(prefix)) {
			const rest = manifest.workspaceRelativePath.slice(prefix.length);
			if (rest.length > 0 && !rest.includes('/')) {
				return true;
			}
		}
	}
	return false;
}

/**
 * Validates §11 acceptance: lite graph lists every workspace root with per-root
 * summaries and at least one top-level path entry per root (when files were indexed).
 */
export function validateQuantumIDELiteGraphListsAllRoots(graph: IQuantumIDEWorkspaceGraph): string[] {
	const errors: string[] = [];
	if (graph.folders.length === 0) {
		return errors;
	}
	const perRoot = graph.status.perRoot ?? [];
	if (perRoot.length !== graph.folders.length) {
		errors.push(`status.perRoot length ${perRoot.length} !== workspace folders ${graph.folders.length}`);
	}
	for (const folder of graph.folders) {
		if (!perRoot.some(r => r.folderName === folder.name)) {
			errors.push(`missing perRoot summary for folder "${folder.name}"`);
		}
	}
	for (const summary of perRoot) {
		if (!graph.folders.some(f => f.name === summary.folderName)) {
			errors.push(`perRoot entry "${summary.folderName}" has no matching workspace folder`);
		}
		if (summary.filesIndexed > 0 && !hasQuantumIDETopLevelEntryForRoot(graph, summary.folderName)) {
			errors.push(`root "${summary.folderName}" has filesIndexed=${summary.filesIndexed} but no top-level path entry`);
		}
		if (summary.filesIndexed === 0 && !summary.truncated) {
			errors.push(`root "${summary.folderName}" has no indexed files and is not marked truncated`);
		}
	}
	return errors;
}
