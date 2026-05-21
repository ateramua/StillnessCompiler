/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { quantumideFuzzyMatchFilePaths } from '../../common/quantumideFuzzyFileMatch.js';

suite('quantumideFuzzyMatchFilePaths', () => {
	test('returns all paths when query empty', () => {
		const paths = ['a/b.ts', 'c/d.ts'];
		const r = quantumideFuzzyMatchFilePaths('', paths, 10);
		assert.strictEqual(r.length, 2);
	});

	test('matches subsequence with highlights', () => {
		const paths = ['src/foo/barComponent.tsx', 'README.md'];
		const r = quantumideFuzzyMatchFilePaths('sbar', paths, 10);
		assert.ok(r.length >= 1);
		assert.strictEqual(r[0].path, 'src/foo/barComponent.tsx');
		assert.ok(r[0].score > 0);
		assert.ok(r[0].highlights.length > 0);
	});
});
