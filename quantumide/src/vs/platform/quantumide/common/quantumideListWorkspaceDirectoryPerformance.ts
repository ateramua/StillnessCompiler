/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { listWorkspaceDirectoryFromStructureIndex } from './quantumideListWorkspaceDirectoryIndex.js';
import { mergeQuantumIDEIgnorePolicy } from './quantumideWorkspaceIgnore.js';
import { buildQuantumIDEWorkspaceGraphStructureIndex, type IQuantumIDEWorkspaceGraphStructureIndex } from './quantumideWorkspaceGraphStructureIndex.js';
import {
	computeQuantumIDEStructuralQueryP95Ms,
	measureQuantumIDEStructuralQuerySamples,
} from './quantumideWorkspaceStructuralQueryPerformance.js';

/** AC-02-02: `list_workspace_directory` on indexed dir (milliseconds, P95). */
export const QUANTUMIDE_LIST_WORKSPACE_DIRECTORY_P95_BUDGET_MS = 10;

const LIST_DIR_PERF_MAX_ENTRIES = 80;
const LIST_DIR_PERF_ITERATIONS = 80;

/** Warm indexed fixture: 10k files across 500 package dirs (≤500 children per dir). */
export function buildQuantumIDEListWorkspaceDirectoryIndexFixture(): IQuantumIDEWorkspaceGraphStructureIndex {
	const paths = Array.from({ length: 10_000 }, (_, i) => `src/pkg${i % 500}/module${i}.ts`);
	return buildQuantumIDEWorkspaceGraphStructureIndex(paths);
}

/**
 * Measures P95 wall time for indexed `list_workspace_directory` (structure index + ignore filter + formatting).
 */
export function measureQuantumIDEListWorkspaceDirectoryIndexP95Ms(
	iterations = LIST_DIR_PERF_ITERATIONS,
): number {
	const index = buildQuantumIDEListWorkspaceDirectoryIndexFixture();
	const policy = mergeQuantumIDEIgnorePolicy(new Set(['node_modules']), undefined, undefined);
	listWorkspaceDirectoryFromStructureIndex(index, 'src/pkg12', LIST_DIR_PERF_MAX_ENTRIES, policy);
	const samples = measureQuantumIDEStructuralQuerySamples(iterations, () => {
		listWorkspaceDirectoryFromStructureIndex(index, 'src/pkg12', LIST_DIR_PERF_MAX_ENTRIES, policy);
		listWorkspaceDirectoryFromStructureIndex(index, '.', LIST_DIR_PERF_MAX_ENTRIES, policy);
	});
	return computeQuantumIDEStructuralQueryP95Ms(samples);
}
