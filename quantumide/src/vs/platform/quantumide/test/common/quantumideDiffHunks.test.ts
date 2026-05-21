/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { buildUnifiedDiffText, computeLineDiffHunks } from '../../common/quantumideDiffHunks.js';

suite('QuantumIDE diff hunks', () => {
	test('builds unified diff text', () => {
		const unified = buildUnifiedDiffText('a.ts', 'a.ts', 'line1\nline2\n', 'line1\nline3\n');
		assert.ok(unified.includes('--- a.ts'));
		assert.ok(unified.includes('+line3'));
	});

	test('computes hunks for edits', () => {
		const hunks = computeLineDiffHunks('a\nb\n', 'a\nc\n');
		assert.strictEqual(hunks.length, 1);
	});
});
