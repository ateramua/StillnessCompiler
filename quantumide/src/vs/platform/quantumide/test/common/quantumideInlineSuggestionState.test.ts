/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import {
	allHunksAccepted,
	buildInlineHunkDispositions,
	remainingPendingHunkIndices,
} from '../../common/quantumideInlineSuggestionState.js';

suite('QuantumIDE inline suggestion state', () => {
	test('buildInlineHunkDispositions', () => {
		const d = buildInlineHunkDispositions(3, new Set([0]), new Set([2]));
		assert.strictEqual(d[0].disposition, 'accepted');
		assert.strictEqual(d[1].disposition, 'pending');
		assert.strictEqual(d[2].disposition, 'rejected');
	});

	test('allHunksAccepted', () => {
		assert.strictEqual(allHunksAccepted(2, new Set([0, 1])), true);
		assert.strictEqual(allHunksAccepted(2, new Set([0])), false);
	});

	test('remainingPendingHunkIndices', () => {
		assert.deepStrictEqual(remainingPendingHunkIndices(4, new Set([0]), new Set([3])), [1, 2]);
	});
});
