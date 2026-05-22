/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import {
	formatQuantumIDEIndexingOffToolFallback,
	formatQuantumIDEWorkspaceContextHeaders,
	getQuantumIDEIndexingOffDiscoverySystemAddon,
	isQuantumIDELiteGraphReason,
} from '../../common/quantumideLiteSnapshotContext.js';

suite('quantumideLiteSnapshotContext', () => {
	test('formatQuantumIDEWorkspaceContextHeaders includes lite disclaimer when indexing off', () => {
		const off = formatQuantumIDEWorkspaceContextHeaders(false);
		assert.ok(off.some(line => line.includes('lite snapshot')));
		assert.ok(off.some(line => line.includes('search_workspace_text')));
		const on = formatQuantumIDEWorkspaceContextHeaders(true);
		assert.ok(on.some(line => line.includes('bounded workspace snapshot')));
	});

	test('isQuantumIDELiteGraphReason detects lite snapshot reason', () => {
		assert.strictEqual(isQuantumIDELiteGraphReason('refresh (lite snapshot; full indexing disabled)'), true);
		assert.strictEqual(isQuantumIDELiteGraphReason('full scan'), false);
	});

	test('getQuantumIDEIndexingOffDiscoverySystemAddon is empty when indexing on', () => {
		assert.strictEqual(getQuantumIDEIndexingOffDiscoverySystemAddon(true), '');
		assert.ok(getQuantumIDEIndexingOffDiscoverySystemAddon(false).includes('indexing is OFF'));
	});

	test('formatQuantumIDEIndexingOffToolFallback names discovery tools', () => {
		const msg = formatQuantumIDEIndexingOffToolFallback('search_semantic_workspace', 'Found 1 match');
		assert.ok(msg.includes('search_semantic_workspace'));
		assert.ok(msg.includes('search_workspace_text'));
		assert.ok(msg.includes('Found 1 match'));
	});
});
