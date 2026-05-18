/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { MessageAttachmentKind, type MessageAttachment } from '../../common/state/sessionState.js';
import { buildOpenAIAttachmentPrompt } from '../../node/openai/openAiAgent.js';

suite('OpenAIAgent', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('formats QuantumIDE workspace context attachments for the model', () => {
		const prompt = buildOpenAIAttachmentPrompt([{
			type: MessageAttachmentKind.Simple,
			label: 'QuantumIDE workspace context',
			modelRepresentation: 'Projects:\n- quantumide (node/typescript)',
			_meta: { source: 'quantumide-workspace-intelligence' },
		}]);

		assert.ok(prompt.includes('Context attachments:'));
		assert.ok(prompt.includes('Attachment: QuantumIDE workspace context'));
		assert.ok(prompt.includes('Projects:\n- quantumide (node/typescript)'));
	});

	test('keeps attachment prompt within the requested budget', () => {
		const attachment: MessageAttachment = {
			type: MessageAttachmentKind.Simple,
			label: 'QuantumIDE workspace context',
			modelRepresentation: 'x'.repeat(500),
		};

		const prompt = buildOpenAIAttachmentPrompt([attachment], 80);

		assert.ok(prompt.length <= 101, `prompt length ${prompt.length} should stay close to the requested budget including wrapper text`);
		assert.ok(prompt.includes('Attachment: QuantumIDE workspace context'));
		assert.ok(!prompt.includes('x'.repeat(100)));
	});

	test('includes resource references without reading file contents', () => {
		const prompt = buildOpenAIAttachmentPrompt([{
			type: MessageAttachmentKind.Resource,
			label: 'src/index.ts',
			uri: 'file:///workspace/src/index.ts',
			displayKind: 'document',
		}]);

		assert.strictEqual(prompt, 'Context attachments:\nReferenced resource: src/index.ts (file:///workspace/src/index.ts)');
	});
});
