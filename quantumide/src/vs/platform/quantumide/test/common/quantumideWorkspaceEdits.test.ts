/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { Schemas } from '../../../../base/common/network.js';
import { FileService } from '../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import {
	applyQuantumIDEWorkspaceEdits,
	formatApplyWorkspaceEditsResult,
	parseWorkspaceEditsArg,
	resolveQuantumIDEWorkspacePath,
} from '../../common/quantumideWorkspaceEdits.js';

suite('quantumideWorkspaceEdits', () => {
	let fileService: FileService;
	let root: URI;

	setup(async () => {
		fileService = new FileService(new NullLogService());
		const provider = new InMemoryFileSystemProvider();
		fileService.registerProvider(Schemas.file, provider);
		root = URI.file('/workspace');
		await fileService.createFolder(root);
	});

	test('parseWorkspaceEditsArg validates operations', () => {
		const parsed = parseWorkspaceEditsArg({
			summary: 'Add helper',
			edits: [{ operation: 'write', path: 'src/a.ts', content: 'export const a = 1;\n' }],
		});
		assert.strictEqual(parsed.edits.length, 1);
		assert.strictEqual(parsed.edits[0].path, 'src/a.ts');
	});

	test('applyQuantumIDEWorkspaceEdits writes and deletes files', async () => {
		const writeResult = await applyQuantumIDEWorkspaceEdits(fileService, root, [
			{ operation: 'create', path: 'src/new.ts', content: 'export const x = 1;\n' },
		]);
		assert.strictEqual(writeResult.applied.length, 1);
		const resource = resolveQuantumIDEWorkspacePath(root, 'src/new.ts');
		const contents = (await fileService.readFile(resource)).value.toString();
		assert.ok(contents.includes('export const x'));

		const deleteResult = await applyQuantumIDEWorkspaceEdits(fileService, root, [
			{ operation: 'delete', path: 'src/new.ts' },
		], { requireDeleteConfirmation: false });
		assert.strictEqual(deleteResult.applied.length, 1);
		assert.strictEqual(await fileService.exists(resource), false);
	});

	test('formatApplyWorkspaceEditsResult summarizes output', () => {
		const text = formatApplyWorkspaceEditsResult({ applied: ['updated a.ts'], skipped: [], errors: [] }, 'test');
		assert.ok(text.includes('Summary: test'));
		assert.ok(text.includes('updated a.ts'));
	});
});
