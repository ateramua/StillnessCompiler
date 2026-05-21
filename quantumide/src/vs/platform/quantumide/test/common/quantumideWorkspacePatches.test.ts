/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { applySimpleUnifiedPatch } from '../../common/quantumideWorkspacePatches.js';

suite('quantumideWorkspacePatches', () => {
	test('applySimpleUnifiedPatch replaces marked section', () => {
		const original = 'alpha\nbeta\ngamma\n';
		const patch = '+++ REPLACE\nbeta\n+++ WITH\ndelta\n';
		const result = applySimpleUnifiedPatch(original, patch);
		assert.strictEqual(result, 'alpha\ndelta\ngamma\n');
	});
});
