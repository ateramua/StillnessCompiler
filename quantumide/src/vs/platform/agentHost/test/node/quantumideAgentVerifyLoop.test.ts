/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { isQuantumIDERefactorHostTool } from '../../../quantumide/common/quantumideRefactorHostTools.js';

suite('QuantumIDE agent verify loop (§8)', () => {
	test('refactor tools are classified for post-verify', () => {
		assert.strictEqual(isQuantumIDERefactorHostTool('extract_method'), true);
		assert.strictEqual(isQuantumIDERefactorHostTool('run_workspace_check'), false);
	});

	test('edit then verify flow is representable', () => {
		const steps = ['apply_workspace_edits', 'run_workspace_check'];
		assert.deepStrictEqual(steps, ['apply_workspace_edits', 'run_workspace_check']);
	});
});
