/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { applyAstAwarePatch, validateAstAwarePatch } from '../../common/quantumideAstPatch.js';

suite('QuantumIDE AST-aware patch', () => {
	test('applies structured REPLACE/WITH hunks', () => {
		const original = 'const a = 1;\nconst b = 2;\n';
		const patch = '+++ REPLACE\nconst a = 1;\n+++ WITH\nconst a = 42;\n';
		const result = applyAstAwarePatch(original, patch);
		assert.strictEqual(result.ok, true);
		assert.ok(result.patched?.includes('const a = 42'));
	});

	test('rejects unbalanced JS after patch', () => {
		const validation = validateAstAwarePatch('file.ts', 'function f() {');
		assert.strictEqual(validation.ok, false);
	});
});
