/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { createEmptyQuantumIDEWorkspaceGraph } from '../../common/quantumideWorkspaceGraph.js';
import {
	isQuantumIDEEditSessionFullRescanAcceptable,
	planQuantumIDEWorkspaceGraphEditSession,
	QUANTUMIDE_EDIT_SESSION_ACCEPTANCE_EDIT_COUNT,
	QUANTUMIDE_EDIT_SESSION_MAX_FULL_RESCAN,
} from '../../common/quantumideWorkspaceGraphEditSession.js';

suite('quantumideWorkspaceGraphEditSession', () => {
	test('AC-01-02: 50 single-file edits schedule no extra full rescans (initial open only)', () => {
		const empty = createEmptyQuantumIDEWorkspaceGraph('ws', [{ name: 'R', uri: 'file:///r' }], 'ok');
		const graph = { ...empty, status: { ...empty.status, indexed: true } };
		const plan = planQuantumIDEWorkspaceGraphEditSession({
			graph,
			editCount: QUANTUMIDE_EDIT_SESSION_ACCEPTANCE_EDIT_COUNT,
			changesPerEdit: 1,
			includeInitialFullRescan: true,
		});
		assert.strictEqual(plan.incrementalSchedules, 50);
		assert.strictEqual(plan.fullRescanSchedules, 1);
		assert.ok(isQuantumIDEEditSessionFullRescanAcceptable(plan, QUANTUMIDE_EDIT_SESSION_MAX_FULL_RESCAN));
	});

	test('large watcher batch schedules full rescan without incremental', () => {
		const empty = createEmptyQuantumIDEWorkspaceGraph('ws', [{ name: 'R', uri: 'file:///r' }], 'ok');
		const graph = { ...empty, status: { ...empty.status, indexed: true } };
		const plan = planQuantumIDEWorkspaceGraphEditSession({
			graph,
			editCount: 1,
			changesPerEdit: 200,
			includeInitialFullRescan: false,
		});
		assert.strictEqual(plan.fullRescanSchedules, 1);
		assert.strictEqual(plan.incrementalSchedules, 0);
	});
});
