/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { executeOpenAIHostTool, getOpenAIHostActivityTools } from '../../../agentHost/node/openai/openaiHostTools.js';
import {
	filterOpenAIHostToolsForPipeline,
	isQuantumIDEHostToolAllowedForPipeline,
} from '../../common/quantumideAgentPipeline.js';
import {
	getQuantumIDELitePipelineSemanticToolBlockCount,
	getQuantumIDESemanticWorkspaceToolInvocationCount,
	resetQuantumIDEAgentPipelineTelemetryForTests,
} from '../../common/quantumideAgentPipelineTelemetry.js';
import { FileService } from '../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';

suite('quantumideAgentPipelineLiteSemantic', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => {
		resetQuantumIDEAgentPipelineTelemetryForTests();
	});

	function createFileService(): FileService {
		const fileService = disposables.add(new FileService(new NullLogService()));
		const provider = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider(Schemas.file, provider));
		return fileService;
	}

	test('AC-03-02: lite pipeline omits search_semantic_workspace from tool list', () => {
		const tools = filterOpenAIHostToolsForPipeline(getOpenAIHostActivityTools('lite'), 'lite');
		const names = tools.map(t => t.function.name);
		assert.ok(!names.includes('search_semantic_workspace'));
		assert.ok(names.includes('search_workspace_text'));
		assert.strictEqual(isQuantumIDEHostToolAllowedForPipeline('search_semantic_workspace', 'lite'), false);
	});

	test('AC-03-02: lite pipeline blocks search_semantic_workspace with zero index invocations', async () => {
		const fileService = createFileService();
		const root = URI.file('/workspace');
		await fileService.writeFile(URI.joinPath(root, 'findme.ts'), VSBuffer.fromString('export const discoverMe = 1;\n'));

		const result = await executeOpenAIHostTool(fileService, root, 'search_semantic_workspace', {
			query: 'discoverMe',
			maxResults: 5,
		}, { agentPipeline: 'lite', indexingEnabled: true });
		assert.ok(result.includes('unavailable on the Lite agent pipeline'));
		assert.strictEqual(getQuantumIDESemanticWorkspaceToolInvocationCount(), 0);
		assert.strictEqual(getQuantumIDELitePipelineSemanticToolBlockCount(), 1);
	});

	test('full pipeline still allows search_semantic_workspace in tool list', () => {
		const tools = filterOpenAIHostToolsForPipeline(getOpenAIHostActivityTools('full'), 'full');
		assert.ok(tools.some(t => t.function.name === 'search_semantic_workspace'));
	});
});
