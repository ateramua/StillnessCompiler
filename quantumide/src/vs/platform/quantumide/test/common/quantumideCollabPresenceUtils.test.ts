/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { filterActiveCollabParticipants, isCollabPresenceStale } from '../../common/quantumideCollabPresenceUtils.js';

suite('QuantumIDE collab presence utils', () => {
	test('isCollabPresenceStale', () => {
		assert.strictEqual(isCollabPresenceStale(1000, 100_000, 90_000), true);
		assert.strictEqual(isCollabPresenceStale(100_000, 150_000, 90_000), false);
	});

	test('filterActiveCollabParticipants excludes self and stale', () => {
		const now = 200_000;
		const participants = [
			{ id: 'self', displayName: 'Me', lastSeen: now, presence: { resource: 'file:///a.ts', line: 1 } },
			{ id: 'peer', displayName: 'Peer', lastSeen: now - 1000, presence: { resource: 'file:///a.ts', line: 5 } },
			{ id: 'stale', displayName: 'Old', lastSeen: now - 200_000, presence: { resource: 'file:///a.ts', line: 2 } },
		];
		const active = filterActiveCollabParticipants(participants, 'self', now, 90_000, 'file:///a.ts');
		assert.strictEqual(active.length, 1);
		assert.strictEqual(active[0].id, 'peer');
	});
});
