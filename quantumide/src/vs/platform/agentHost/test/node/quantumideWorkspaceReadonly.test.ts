/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileService } from '../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import {
	detectQuantumIDEWorkspaceReadonly,
	formatQuantumIDEWorkspaceReadonlyToolError,
	isQuantumIDEWorkspaceFileMutatingHostTool,
} from '../../../quantumide/common/quantumideWorkspaceReadonly.js';
import { executeOpenAIHostTool } from '../../node/openai/openaiHostTools.js';

suite('quantumideWorkspaceReadonly', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('formatQuantumIDEWorkspaceReadonlyToolError mentions read-only and discovery', () => {
		const msg = formatQuantumIDEWorkspaceReadonlyToolError('apply_workspace_edits');
		assert.ok(msg.includes('read-only'));
		assert.ok(msg.includes('apply_workspace_edits'));
		assert.ok(msg.includes('Discovery'));
	});

	test('isQuantumIDEWorkspaceFileMutatingHostTool classifies write tools', () => {
		assert.strictEqual(isQuantumIDEWorkspaceFileMutatingHostTool('apply_workspace_edits'), true);
		assert.strictEqual(isQuantumIDEWorkspaceFileMutatingHostTool('search_workspace_text'), false);
		assert.strictEqual(isQuantumIDEWorkspaceFileMutatingHostTool('normalize_imports', { autoApplyEdits: true }), true);
		assert.strictEqual(isQuantumIDEWorkspaceFileMutatingHostTool('normalize_imports', { autoApplyEdits: false }), false);
	});

	test('detectQuantumIDEWorkspaceReadonly when provider is readonly', async () => {
		const fileService = new FileService(new NullLogService());
		const provider = new InMemoryFileSystemProvider();
		fileService.registerProvider(Schemas.file, provider);
		const root = URI.file('/readonly-ws');
		await fileService.createFolder(root);
		provider.setReadOnly(true);
		assert.strictEqual(await detectQuantumIDEWorkspaceReadonly(fileService, root), true);
	});

	test('executeOpenAIHostTool: read OK and write fails on readonly workspace', async () => {
		const fileService = new FileService(new NullLogService());
		const provider = new InMemoryFileSystemProvider();
		fileService.registerProvider(Schemas.file, provider);
		const root = URI.file('/readonly-agent');
		await fileService.createFolder(root);
		const file = URI.joinPath(root, 'src/a.ts');
		await fileService.createFolder(URI.joinPath(root, 'src'));
		await fileService.writeFile(file, VSBuffer.fromString('export const NEEDLE = 1;'));
		provider.setReadOnly(true);
		assert.strictEqual(await detectQuantumIDEWorkspaceReadonly(fileService, root), true);

		const readResult = await executeOpenAIHostTool(
			fileService,
			root,
			'read_workspace_file',
			{ path: 'src/a.ts' },
			{ workspaceReadonly: true },
		);
		assert.ok(readResult.includes('NEEDLE'));

		const searchResult = await executeOpenAIHostTool(
			fileService,
			root,
			'search_workspace_text',
			{ query: 'NEEDLE' },
			{ workspaceReadonly: true },
		);
		assert.ok(searchResult.includes('NEEDLE') || searchResult.includes('match'));

		const writeResult = await executeOpenAIHostTool(
			fileService,
			root,
			'apply_workspace_edits',
			{ edits: [{ operation: 'write', path: 'src/b.ts', content: 'export {};\n' }] },
			{ autoApplyEdits: true, workspaceReadonly: true },
		);
		assert.ok(writeResult.includes('read-only'));
		assert.ok(writeResult.includes('apply_workspace_edits'));
	});
});
