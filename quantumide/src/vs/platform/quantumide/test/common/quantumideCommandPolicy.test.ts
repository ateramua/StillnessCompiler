/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { evaluateQuantumIDECommandPolicy, filterMatchingCommands } from '../../common/quantumideCommandPolicy.js';

suite('quantumideCommandPolicy', () => {
	test('blocks denylisted commands', () => {
		const result = evaluateQuantumIDECommandPolicy('workbench.action.quit');
		assert.strictEqual(result.allowed, false);
	});

	test('allows safe commands', () => {
		const result = evaluateQuantumIDECommandPolicy('editor.action.formatDocument');
		assert.strictEqual(result.allowed, true);
	});

	test('filterMatchingCommands ranks prefix matches', () => {
		const matches = filterMatchingCommands('format', [
			'editor.action.formatDocument',
			'workbench.action.quit',
			'notebook.formatCell',
		]);
		assert.ok(matches[0].includes('format'));
	});
});
