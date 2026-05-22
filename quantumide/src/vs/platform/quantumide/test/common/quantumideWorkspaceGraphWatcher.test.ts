/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { createEmptyQuantumIDEWorkspaceGraph } from '../../common/quantumideWorkspaceGraph.js';
import {
	planWorkspaceGraphFileWatcherRefresh,
	QUANTUMIDE_FILE_WATCHER_FULL_REFRESH_DEBOUNCE_MS,
	QUANTUMIDE_FILE_WATCHER_INCREMENTAL_DEBOUNCE_MS,
} from '../../common/quantumideWorkspaceGraphWatcher.js';
import { QUANTUMIDE_WORKSPACE_UNTRUSTED_REASON } from '../../common/quantumideWorkspaceTrust.js';

suite('quantumideWorkspaceGraphWatcher', () => {
	test('debounce constants meet §11 acceptance (incremental fast, full refresh ≤3s)', () => {
		assert.ok(QUANTUMIDE_FILE_WATCHER_INCREMENTAL_DEBOUNCE_MS < QUANTUMIDE_FILE_WATCHER_FULL_REFRESH_DEBOUNCE_MS);
		assert.strictEqual(QUANTUMIDE_FILE_WATCHER_FULL_REFRESH_DEBOUNCE_MS, 3_000);
	});

	test('planWorkspaceGraphFileWatcherRefresh uses incremental for small indexed graph changes', () => {
		const empty = createEmptyQuantumIDEWorkspaceGraph('ws', [{ name: 'R', uri: 'file:///r' }], 'ok');
		const graph = { ...empty, status: { ...empty.status, indexed: true } };
		const plan = planWorkspaceGraphFileWatcherRefresh({ changeCount: 1, graph });
		assert.strictEqual(plan.runIncremental, true);
		assert.strictEqual(plan.runDebouncedFullRefresh, true);
	});

	test('planWorkspaceGraphFileWatcherRefresh falls back to debounced full refresh when batch is large', () => {
		const empty = createEmptyQuantumIDEWorkspaceGraph('ws', [{ name: 'R', uri: 'file:///r' }], 'ok');
		const graph = { ...empty, status: { ...empty.status, indexed: true } };
		const plan = planWorkspaceGraphFileWatcherRefresh({ changeCount: 200, graph });
		assert.strictEqual(plan.runIncremental, false);
		assert.strictEqual(plan.runDebouncedFullRefresh, true);
	});

	test('planWorkspaceGraphFileWatcherRefresh uses debounced refresh when graph is untrusted', () => {
		const graph = createEmptyQuantumIDEWorkspaceGraph('ws', [{ name: 'R', uri: 'file:///r' }], QUANTUMIDE_WORKSPACE_UNTRUSTED_REASON);
		const plan = planWorkspaceGraphFileWatcherRefresh({ changeCount: 1, graph });
		assert.strictEqual(plan.runIncremental, false);
		assert.strictEqual(plan.runDebouncedFullRefresh, true);
	});
});
