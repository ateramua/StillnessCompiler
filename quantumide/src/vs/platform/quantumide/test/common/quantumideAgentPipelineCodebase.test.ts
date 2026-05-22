/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { chatVariablesHaveQuantumIDECodebaseAttachment } from '../../common/quantumideAgentIntentClassifier.js';
import {
	filterOpenAIHostToolsForPipeline,
	isQuantumIDEHostToolAllowedForPipeline,
} from '../../common/quantumideAgentPipeline.js';
import { getOpenAIHostActivityTools } from '../../../agentHost/node/openai/openaiHostTools.js';

suite('quantumideAgentPipelineCodebase', () => {
	test('AC-03-03: full pipeline exposes search_semantic_workspace', () => {
		const tools = filterOpenAIHostToolsForPipeline(getOpenAIHostActivityTools('full'), 'full');
		assert.ok(tools.some(t => t.function.name === 'search_semantic_workspace'));
		assert.strictEqual(isQuantumIDEHostToolAllowedForPipeline('search_semantic_workspace', 'full'), true);
	});

	test('AC-03-03: detects codebase variable attachment', () => {
		assert.strictEqual(
			chatVariablesHaveQuantumIDECodebaseAttachment([{ id: 'quantumide.codebase', name: 'codebase' }]),
			true,
		);
		assert.strictEqual(
			chatVariablesHaveQuantumIDECodebaseAttachment([{ id: 'vscode.file', name: 'file' }]),
			false,
		);
	});
});
