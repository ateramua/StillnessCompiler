/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileService } from '../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import {
	createQuantumIDEHostAgentRoundFileCache,
	runQuantumIDEParallelHostReadCoalesceFixture,
} from '../../common/quantumideHostAgentRoundFileCache.js';
import { executeOpenAIHostTool } from '../../../agentHost/node/openai/openaiHostTools.js';

suite('quantumideHostAgentRoundFileCache', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createFileService(): FileService {
		const fileService = disposables.add(new FileService(new NullLogService()));
		const provider = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider(Schemas.file, provider));
		return fileService;
	}

	test('coalesces parallel stat and read for same URI', async () => {
		const fileService = createFileService();
		const resource = URI.file('/workspace/shared.ts');
		await fileService.writeFile(resource, VSBuffer.fromString('shared content'));
		const cache = createQuantumIDEHostAgentRoundFileCache();
		await Promise.all(Array.from({ length: 8 }, () => cache.coalescedReadFile(fileService, resource)));
		assert.strictEqual(cache.statCalls, 0);
		assert.strictEqual(cache.readCalls, 1);
		assert.ok(cache.inflightHits >= 7, `expected inflight dedupe, got inflightHits=${cache.inflightHits}`);
	});

	test('AC-02-03: 8 parallel read_workspace_file calls dedupe IFileService for same path', async () => {
		const fileService = createFileService();
		const root = URI.file('/workspace');
		const file = URI.joinPath(root, 'dup.ts');
		await fileService.writeFile(file, VSBuffer.fromString('export const x = 1;\n'));
		const result = await runQuantumIDEParallelHostReadCoalesceFixture(async cache => {
			await executeOpenAIHostTool(fileService, root, 'read_workspace_file', { path: 'dup.ts' }, { agentRoundFileCache: cache });
		});
		assert.strictEqual(result.parallelReads, 8);
		assert.strictEqual(result.statCalls, 1, 'expected one stat per URI in agent round');
		assert.strictEqual(result.readCalls, 1, 'expected one readFile per URI in agent round');
		assert.strictEqual(result.resolveCalls, 0);
		assert.ok(result.inflightHits >= 7);
	});
});
