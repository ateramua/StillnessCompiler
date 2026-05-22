/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import {
	acquireQuantumIDEWorkspaceGraphFullRefresh,
	isQuantumIDEWorkspaceGraphFullRefreshInFlight,
	releaseQuantumIDEWorkspaceGraphFullRefresh,
	resetQuantumIDEWorkspaceGraphRefreshCoordinatorForTests,
	shouldCommitQuantumIDEWorkspaceGraphIncrementalPatch,
	tryAcquireQuantumIDEWorkspaceGraphIncrementalPatch,
} from '../../common/quantumideWorkspaceGraphRefreshCoordinator.js';
import { verifyQuantumIDEGraphPatchRefreshConsistency } from '../../common/quantumideWorkspaceGraphRefreshConsistency.js';

suite('quantumideWorkspaceGraphRefreshConsistency', () => {
	teardown(() => {
		resetQuantumIDEWorkspaceGraphRefreshCoordinatorForTests();
	});

	test('CON-05: incremental patch blocked while full refresh in flight', () => {
		const full = acquireQuantumIDEWorkspaceGraphFullRefresh(1);
		assert.ok(isQuantumIDEWorkspaceGraphFullRefreshInFlight());
		assert.strictEqual(tryAcquireQuantumIDEWorkspaceGraphIncrementalPatch(1), undefined);
		releaseQuantumIDEWorkspaceGraphFullRefresh(full);
		assert.ok(!isQuantumIDEWorkspaceGraphFullRefreshInFlight());
	});

	test('AC-04-05: concurrent patch + full refresh keeps refresh graph', () => {
		const result = verifyQuantumIDEGraphPatchRefreshConsistency();
		assert.strictEqual(result.consistent, true);
		assert.strictEqual(result.finalFileCount, 20);
		assert.strictEqual(result.patchCommitted, false);
	});

	test('shouldCommit rejects stale generation and graph reference', () => {
		const lease = { kind: 'incremental' as const, mutationEpoch: 1, graphGenerationAtAcquire: 1 };
		const g1 = { version: 1 } as never;
		const g2 = { version: 1 } as never;
		assert.strictEqual(shouldCommitQuantumIDEWorkspaceGraphIncrementalPatch(lease, g1, g2, 2), false);
		assert.strictEqual(shouldCommitQuantumIDEWorkspaceGraphIncrementalPatch(lease, g1, g1, 1), true);
	});
});
