/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import {
	getAgentVelocityProfileSystemAddon,
	isReadOnlyOpenAIHostTool,
} from '../../common/agentVelocity.js';
import { formatStructuredCompileErrors } from '../../../agentHost/node/openai/openaiHostTools.js';

suite('agentVelocity', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('identifies read-only host tools', () => {
		assert.strictEqual(isReadOnlyOpenAIHostTool('read_workspace_file'), true);
		assert.strictEqual(isReadOnlyOpenAIHostTool('search_workspace_text_batch'), true);
		assert.strictEqual(isReadOnlyOpenAIHostTool('run_workspace_check'), false);
	});

	test('profile addons differ', () => {
		assert.ok(getAgentVelocityProfileSystemAddon('dev').includes('dev profile'));
		assert.ok(getAgentVelocityProfileSystemAddon('ship').includes('ship profile'));
	});

	test('formatStructuredCompileErrors extracts error lines', () => {
		const out = formatStructuredCompileErrors('ok\n', 'src/foo.ts:10:3 - error TS2304: Cannot find name');
		assert.ok(out.includes('Structured errors'));
		assert.ok(out.includes('TS2304'));
	});
});
