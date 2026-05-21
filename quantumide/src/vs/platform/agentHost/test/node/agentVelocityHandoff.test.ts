/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileService } from '../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import {
	extractAgentVelocityTasksFromAssistant,
	loadAgentVelocityTasks,
	mergeAndPersistAgentVelocityTasks,
} from '../../node/openai/agentVelocityHandoff.js';

suite('agentVelocityHandoff', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createFileService(): FileService {
		const fileService = disposables.add(new FileService(new NullLogService()));
		const provider = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider(Schemas.file, provider));
		return fileService;
	}

	test('extracts open checklist items from assistant text', () => {
		const tasks = extractAgentVelocityTasksFromAssistant([
			'Plan:',
			'- [ ] Wire config hot-reload',
			'- [x] Done item',
			'* [ ] Second task',
		].join('\n'));
		assert.deepStrictEqual(tasks, ['Wire config hot-reload', 'Second task']);
	});

	test('mergeAndPersist writes tasks file', async () => {
		const fileService = createFileService();
		const root = URI.file('/workspace');
		const tasks = await mergeAndPersistAgentVelocityTasks(fileService, root, '- [ ] Finish compile\n', []);
		assert.deepStrictEqual(tasks, ['Finish compile']);
		const loaded = await loadAgentVelocityTasks(fileService, root);
		assert.deepStrictEqual(loaded, ['Finish compile']);
	});
});
