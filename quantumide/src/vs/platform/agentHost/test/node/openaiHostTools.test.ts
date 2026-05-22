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
import { writeQuantumIDEIndexingStatus } from '../../../quantumide/common/quantumideIndexingStatusStore.js';
import { executeOpenAIHostTool, isOpenAIHostTool } from '../../node/openai/openaiHostTools.js';

suite('openaiHostTools', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createFileService(): FileService {
		const fileService = disposables.add(new FileService(new NullLogService()));
		const provider = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider(Schemas.file, provider));
		return fileService;
	}

	test('identifies host activity tools', () => {
		assert.strictEqual(isOpenAIHostTool('search_workspace_text'), true);
		assert.strictEqual(isOpenAIHostTool('search_workspace_text_batch'), true);
		assert.strictEqual(isOpenAIHostTool('read_workspace_file'), true);
		assert.strictEqual(isOpenAIHostTool('list_workspace_symbols'), true);
		assert.strictEqual(isOpenAIHostTool('run_workspace_check'), true);
		assert.strictEqual(isOpenAIHostTool('apply_workspace_edits'), true);
		assert.strictEqual(isOpenAIHostTool('search_workspace_symbols'), true);
		assert.strictEqual(isOpenAIHostTool('propose_file_edit'), false);
	});

	test('reads workspace files relative to working directory', async () => {
		const fileService = createFileService();
		const root = URI.file('/workspace');
		const file = URI.joinPath(root, 'src/hello.ts');
		await fileService.createFolder(URI.joinPath(root, 'src'));
		await fileService.writeFile(file, VSBuffer.fromString('export const hello = 1;'));

		const result = await executeOpenAIHostTool(fileService, root, 'read_workspace_file', { path: 'src/hello.ts' });
		assert.ok(result.includes('export const hello = 1;'));
	});

	test('reads a line range when startLine and endLine are provided', async () => {
		const fileService = createFileService();
		const root = URI.file('/workspace');
		const file = URI.joinPath(root, 'lines.txt');
		await fileService.writeFile(file, VSBuffer.fromString('one\ntwo\nthree\nfour'));

		const result = await executeOpenAIHostTool(fileService, root, 'read_workspace_file', { path: 'lines.txt', startLine: 2, endLine: 3 });
		assert.strictEqual(result, 'two\nthree');
	});

	test('lists symbols in a workspace file', async () => {
		const fileService = createFileService();
		const root = URI.file('/workspace');
		const file = URI.joinPath(root, 'mod.ts');
		await fileService.writeFile(file, VSBuffer.fromString('export function hello() {}\nexport class Widget {}'));

		const result = await executeOpenAIHostTool(fileService, root, 'list_workspace_symbols', { path: 'mod.ts' });
		assert.ok(result.includes('hello'));
		assert.ok(result.includes('Widget'));
	});

	test('searches workspace text and returns excerpts', async () => {
		const fileService = createFileService();
		const root = URI.file('/workspace');
		const file = URI.joinPath(root, 'notes.txt');
		await fileService.writeFile(file, VSBuffer.fromString('QuantumIDE live agent activity'));

		const result = await executeOpenAIHostTool(fileService, root, 'search_workspace_text', { query: 'activity' });
		assert.ok(result.includes('Found 1 match'));
		assert.ok(result.includes('activity'));
		assert.ok(result.includes('ripgrep') || result.includes('scanned'), 'expected ripgrep or scan-fallback engine label');
	});

	test('apply_workspace_edits respects autoApplyEdits gate', async () => {
		const fileService = createFileService();
		const root = URI.file('/workspace');
		const blocked = await executeOpenAIHostTool(fileService, root, 'apply_workspace_edits', {
			edits: [{ operation: 'write', path: 'out.ts', content: 'export {};\n' }],
		}, { autoApplyEdits: false });
		assert.ok(blocked.includes('autoApplyEdits'));

		const applied = await executeOpenAIHostTool(fileService, root, 'apply_workspace_edits', {
			edits: [{ operation: 'write', path: 'out.ts', content: 'export {};\n' }],
		}, { autoApplyEdits: true });
		assert.ok(applied.includes('updated out.ts'));
	});

	test('apply_workspace_edits returns indexing gate without partial write when not ready', async () => {
		const fileService = createFileService();
		const root = URI.file('/workspace');
		await writeQuantumIDEIndexingStatus(fileService, root, {
			ready: false,
			busy: true,
			percent: 12,
			indexedFiles: 3,
			updatedAt: new Date().toISOString(),
		});
		const target = URI.joinPath(root, 'gate-blocked.ts');
		const result = await executeOpenAIHostTool(fileService, root, 'apply_workspace_edits', {
			edits: [{ operation: 'write', path: 'gate-blocked.ts', content: 'export const blocked = 1;\n' }],
		}, { autoApplyEdits: true, waitForIndexingBeforeEdits: true });
		assert.ok(result.includes('indexing'));
		assert.strictEqual(await fileService.exists(target), false);
	});

	test('search_semantic_workspace falls back when indexing is disabled', async () => {
		const fileService = createFileService();
		const root = URI.file('/workspace');
		await fileService.writeFile(URI.joinPath(root, 'findme.ts'), VSBuffer.fromString('export const discoverMe = 1;\n'));

		const result = await executeOpenAIHostTool(fileService, root, 'search_semantic_workspace', {
			query: 'discoverMe',
			maxResults: 5,
		}, { indexingEnabled: false });
		assert.ok(result.includes('indexing is disabled'));
		assert.ok(result.includes('search_workspace_text'));
		assert.ok(result.includes('discoverMe') || result.includes('findme.ts'));
	});

	test('apply_workspace_edits applies when indexing ready', async () => {
		const fileService = createFileService();
		const root = URI.file('/workspace');
		await writeQuantumIDEIndexingStatus(fileService, root, {
			ready: true,
			busy: false,
			indexedFiles: 50,
			updatedAt: new Date().toISOString(),
		});
		const result = await executeOpenAIHostTool(fileService, root, 'apply_workspace_edits', {
			edits: [{ operation: 'write', path: 'ready.ts', content: 'export const ok = 1;\n' }],
		}, { autoApplyEdits: true, waitForIndexingBeforeEdits: true });
		assert.ok(result.includes('updated ready.ts'));
	});

	test('batch search returns sections per query', async () => {
		const fileService = createFileService();
		const root = URI.file('/workspace');
		await fileService.writeFile(URI.joinPath(root, 'a.txt'), VSBuffer.fromString('alpha'));
		await fileService.writeFile(URI.joinPath(root, 'b.txt'), VSBuffer.fromString('beta'));

		const result = await executeOpenAIHostTool(fileService, root, 'search_workspace_text_batch', { queries: ['alpha', 'beta'] });
		assert.ok(result.includes('## Query: alpha'));
		assert.ok(result.includes('## Query: beta'));
	});
});
