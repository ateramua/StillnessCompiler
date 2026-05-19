/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ToolCallConfirmationReason, ToolCallStatus, type ToolCallState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { toolCallStateToInvocation } from '../../../browser/agentSessions/agentHost/stateToProgressAdapter.js';
import { URI } from '../../../../../../base/common/uri.js';

suite('agentActivityLabels adapter integration', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('toolCallStateToInvocation uses mapped labels for common Copilot tools', () => {
		const state: ToolCallState = {
			status: ToolCallStatus.Running,
			toolCallId: 'tc-grep',
			toolName: 'grep',
			displayName: 'grep',
			invocationMessage: 'grep',
			confirmed: ToolCallConfirmationReason.NotNeeded,
			toolInput: JSON.stringify({ query: 'OpenAI' }),
		};
		const invocation = toolCallStateToInvocation(state, undefined, URI.parse('agent-session://copilot/test'), undefined);
		assert.strictEqual(invocation.toolId, 'grep');
		assert.ok(invocation.invocationMessage?.toString().includes('Searched workspace'));
	});
});
