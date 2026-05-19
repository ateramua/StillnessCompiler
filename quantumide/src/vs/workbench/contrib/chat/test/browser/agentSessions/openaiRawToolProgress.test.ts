/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { ActionType } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { ToolCallConfirmationReason, ToolResultContentType } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IChatToolInvocation } from '../../../common/chatService/chatService.js';
import { OpenAIRawToolProgressRouter } from '../../../browser/agentSessions/agentHost/openaiRawToolProgress.js';

suite('OpenAIRawToolProgressRouter', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('maps tool start, ready, and complete actions to chat progress', () => {
		const router = new OpenAIRawToolProgressRouter(URI.parse('agent-session://openai/test'), 'local');
		const start = router.handleAction({
			type: ActionType.SessionToolCallStart,
			session: 'agent-session://openai/test',
			turnId: 'turn-1',
			toolCallId: 'tc-1',
			toolName: 'search_workspace_text',
			displayName: 'Searched workspace',
			_meta: { toolKind: 'search' },
		});
		assert.strictEqual(start.length, 1);
		assert.strictEqual(start[0].kind, 'toolInvocation');

		const ready = router.handleAction({
			type: ActionType.SessionToolCallReady,
			session: 'agent-session://openai/test',
			turnId: 'turn-1',
			toolCallId: 'tc-1',
			invocationMessage: 'Running search',
			toolInput: '{"query":"foo"}',
			confirmed: ToolCallConfirmationReason.NotNeeded,
		});
		assert.strictEqual(ready.length, 1);
		assert.strictEqual(ready[0].kind, 'toolInvocation');
		const readyInvocation = ready[0] as IChatToolInvocation;
		assert.ok(String(readyInvocation.invocationMessage).includes('foo'));

		const complete = router.handleAction({
			type: ActionType.SessionToolCallComplete,
			session: 'agent-session://openai/test',
			turnId: 'turn-1',
			toolCallId: 'tc-1',
			result: {
				success: true,
				pastTenseMessage: 'Searched workspace',
				content: [{ type: ToolResultContentType.Text, text: 'Found 2 matches' }],
			},
		});
		assert.strictEqual(complete.length, 0, 'finalizeToolInvocation updates the existing invocation in place');

		const invocation = start[0] as IChatToolInvocation;
		assert.strictEqual(IChatToolInvocation.isComplete(invocation), true);
		router.dispose();
	});
});
