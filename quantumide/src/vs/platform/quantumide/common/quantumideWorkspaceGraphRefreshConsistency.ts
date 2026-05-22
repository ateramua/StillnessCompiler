/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import type { IQuantumIDEFileNode, IQuantumIDEWorkspaceGraph } from './quantumideWorkspaceGraph.js';
import { patchQuantumIDEWorkspaceGraphFromWatcher } from './quantumideWorkspaceGraphWatcher.js';
import {
	acquireQuantumIDEWorkspaceGraphFullRefresh,
	releaseQuantumIDEWorkspaceGraphFullRefresh,
	resetQuantumIDEWorkspaceGraphRefreshCoordinatorForTests,
	shouldCommitQuantumIDEWorkspaceGraphIncrementalPatch,
	tryAcquireQuantumIDEWorkspaceGraphIncrementalPatch,
	type IQuantumIDEWorkspaceGraphMutationLease,
} from './quantumideWorkspaceGraphRefreshCoordinator.js';

export interface IQuantumIDEGraphPatchRefreshConsistencyResult {
	readonly consistent: boolean;
	readonly finalFileCount: number;
	readonly patchCommitted: boolean;
}

function makeFixtureGraph(fileCount: number): IQuantumIDEWorkspaceGraph {
	const files: IQuantumIDEFileNode[] = Array.from({ length: fileCount }, (_, i) => ({
		uri: `file:///R/f${i}.ts`,
		workspaceRelativePath: `R/f${i}.ts`,
		name: `f${i}.ts`,
		extension: '.ts',
	}));
	return {
		version: 1,
		workspaceId: 'fixture',
		folders: [{ name: 'R', uri: 'file:///R' }],
		projects: [],
		manifests: [],
		files,
		status: {
			indexed: true,
			generatedAt: new Date().toISOString(),
			reason: 'fixture',
		},
	};
}

/**
 * AC-04-05: concurrent patch during full refresh must not publish stale graph state.
 */
export function verifyQuantumIDEGraphPatchRefreshConsistency(): IQuantumIDEGraphPatchRefreshConsistencyResult {
	resetQuantumIDEWorkspaceGraphRefreshCoordinatorForTests();
	const graphV1 = makeFixtureGraph(10);
	const genV1 = 1;

	const fullLease = acquireQuantumIDEWorkspaceGraphFullRefresh(genV1);
	const blockedPatch = tryAcquireQuantumIDEWorkspaceGraphIncrementalPatch(genV1);

	const stalePatchLease: IQuantumIDEWorkspaceGraphMutationLease = {
		kind: 'incremental',
		mutationEpoch: 0,
		graphGenerationAtAcquire: genV1,
	};
	const patchedOnV1 = patchQuantumIDEWorkspaceGraphFromWatcher(graphV1, {
		added: [{
			uri: 'file:///R/new.ts',
			workspaceRelativePath: 'R/new.ts',
			name: 'new.ts',
			extension: '.ts',
		}],
	});

	const graphV2 = makeFixtureGraph(20);
	const genV2 = 2;
	releaseQuantumIDEWorkspaceGraphFullRefresh(fullLease);

	const patchCommitted = shouldCommitQuantumIDEWorkspaceGraphIncrementalPatch(
		stalePatchLease,
		graphV1,
		graphV2,
		genV2,
	);
	const finalGraph = patchCommitted ? patchedOnV1 : graphV2;
	const consistent = !patchCommitted
		&& blockedPatch === undefined
		&& finalGraph.files.length === 20;

	return {
		consistent,
		finalFileCount: finalGraph.files.length,
		patchCommitted,
	};
}
