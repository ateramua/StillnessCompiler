/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { filterActiveCollabParticipants } from '../../common/quantumideCollabPresenceUtils.js';
import { buildInlineHunkDispositions, remainingPendingHunkIndices } from '../../common/quantumideInlineSuggestionState.js';
import { computeLineDiffHunks } from '../../common/quantumideDiffHunks.js';
import { isAgentWritableSettingKey, isValidMarketplaceExtensionId } from '../../common/quantumideIdeSettingPolicy.js';
import { evaluateQuantumIDECommandPolicy } from '../../common/quantumideCommandPolicy.js';

/**
 * Phase 3 acceptance bundle — pure-logic coverage for Option B program §1–§6 helpers.
 */
suite('QuantumIDE Cursor parity program Phase 3', () => {
	test('rename path uses diff hunks for staged preview text', () => {
		const hunks = computeLineDiffHunks('function oldName() {}\n', 'function newName() {}\n');
		assert.ok(hunks.length >= 1);
	});

	test('inline accept-all disposition tracking', () => {
		const accepted = new Set([0, 1]);
		const rejected = new Set<number>();
		const d = buildInlineHunkDispositions(3, accepted, rejected);
		assert.strictEqual(d.filter(x => x.disposition === 'pending').length, 1);
		assert.deepStrictEqual(remainingPendingHunkIndices(3, accepted, rejected), [2]);
	});

	test('collab filters remote peers on same resource', () => {
		const now = 1_000_000;
		const peers = filterActiveCollabParticipants(
			[
				{ id: 'a', displayName: 'A', lastSeen: now, presence: { resource: 'file:///x.ts', line: 1 } },
				{ id: 'b', displayName: 'B', lastSeen: now, presence: { resource: 'file:///y.ts', line: 2 } },
			],
			'self',
			now,
			90_000,
			'file:///x.ts',
		);
		assert.strictEqual(peers.length, 1);
		assert.strictEqual(peers[0].id, 'a');
	});

	test('extension install policy', () => {
		assert.strictEqual(isValidMarketplaceExtensionId('publisher.name'), true);
		assert.strictEqual(isAgentWritableSettingKey('quantumide.chat.collab.enabled'), true);
	});

	test('palette commands allowed for editor integration', () => {
		assert.strictEqual(evaluateQuantumIDECommandPolicy('editor.action.rename').allowed, true);
		assert.strictEqual(evaluateQuantumIDECommandPolicy('workbench.action.quit').allowed, false);
	});
});
