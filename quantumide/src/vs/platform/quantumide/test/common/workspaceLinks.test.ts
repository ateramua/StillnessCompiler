/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { parseWorkspaceLinksJson } from '../../common/workspaceLinks.js';

suite('workspaceLinks', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('parses roots array wrapper', () => {
		const links = parseWorkspaceLinksJson(JSON.stringify({
			roots: [{ name: 'A', path: '/a' }, { name: 'B', path: '/b' }],
		}));
		assert.strictEqual(links.length, 2);
		assert.strictEqual(links[0].name, 'A');
	});

	test('parses top-level array', () => {
		const links = parseWorkspaceLinksJson(JSON.stringify([{ name: 'X', path: '/x' }]));
		assert.strictEqual(links.length, 1);
	});

	test('ignores invalid entries', () => {
		const links = parseWorkspaceLinksJson(JSON.stringify({ roots: [{ name: '', path: '' }, { name: 'ok', path: '/ok' }] }));
		assert.strictEqual(links.length, 1);
	});
});
