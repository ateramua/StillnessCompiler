/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { FileService } from '../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import {
	getIndexingGateMessage,
	readQuantumIDEIndexingStatus,
	writeQuantumIDEIndexingStatus,
} from '../../common/quantumideIndexingStatusStore.js';

suite('quantumideIndexingStatusStore', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const root = URI.file('/workspace');

	function createFileService(): FileService {
		const fileService = disposables.add(new FileService(new NullLogService()));
		const provider = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider(Schemas.file, provider));
		return fileService;
	}

	test('getIndexingGateMessage blocks when ready is false', async () => {
		const fileService = createFileService();
		await writeQuantumIDEIndexingStatus(fileService, root, {
			ready: false,
			busy: true,
			percent: 40,
			indexedFiles: 10,
			updatedAt: new Date().toISOString(),
		});
		const gate = await getIndexingGateMessage(fileService, root, true);
		assert.ok(gate?.includes('in progress'));
		const status = await readQuantumIDEIndexingStatus(fileService, root);
		assert.strictEqual(status?.ready, false);
	});

	test('getIndexingGateMessage allows when ready is true', async () => {
		const fileService = createFileService();
		await writeQuantumIDEIndexingStatus(fileService, root, {
			ready: true,
			busy: false,
			indexedFiles: 100,
			updatedAt: new Date().toISOString(),
		});
		const gate = await getIndexingGateMessage(fileService, root, true);
		assert.strictEqual(gate, undefined);
	});

	test('getIndexingGateMessage is off when waitForIndexing is false', async () => {
		const fileService = createFileService();
		await fileService.writeFile(
			URI.joinPath(root, '.quantumide/indexing-status.json'),
			VSBuffer.fromString(JSON.stringify({ ready: false, busy: true, indexedFiles: 0, updatedAt: '' })),
		);
		const gate = await getIndexingGateMessage(fileService, root, false);
		assert.strictEqual(gate, undefined);
	});
});
