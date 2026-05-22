/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import {
	parseQuantumIDERuleFrontmatter,
	ruleMatchesActiveFiles,
	selectQuantumIDEChatRules,
} from '../../common/quantumideChatRules.js';

suite('quantumideChatRules', () => {
	test('parses auto globs from frontmatter', () => {
		const { activation, globs } = parseQuantumIDERuleFrontmatter('---\nglobs: src/**, test/**\n---\n\nRule body');
		assert.strictEqual(activation, 'auto');
		assert.strictEqual(globs.length, 2);
	});

	test('selects always and matching auto rules', () => {
		const rules = selectQuantumIDEChatRules([
			{ path: 'a.md', activation: 'always', globs: [], content: 'A' },
			{ path: 'b.md', activation: 'auto', globs: ['src/'], content: 'B' },
		], ['src/foo.ts']);
		assert.strictEqual(rules.always.length, 1);
		assert.strictEqual(rules.auto.length, 1);
		assert.ok(ruleMatchesActiveFiles({ path: 'b.md', activation: 'auto', globs: ['src/'], content: '' }, ['src/foo.ts']));
	});
});
