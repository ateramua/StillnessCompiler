/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { executeOpenAIHostTool } from '../../../agentHost/node/openai/openaiHostTools.js';
import { FileService } from '../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import {
	applyQuantumIDEHostToolPayloadCap,
	parseQuantumIDEHostToolPayloadMeta,
	QUANTUMIDE_HOST_TOOL_PAYLOAD_MAX_BYTES,
	truncateQuantumIDEHostToolPayload,
	utf8ByteLength,
} from '../../common/quantumideHostToolPayload.js';

suite('quantumideHostToolPayload', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createFileService(): FileService {
		const fileService = disposables.add(new FileService(new NullLogService()));
		const provider = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider(Schemas.file, provider));
		return fileService;
	}

	test('payload within budget is unchanged', () => {
		const payload = 'hello world';
		const result = truncateQuantumIDEHostToolPayload(payload, 'read_workspace_file');
		assert.strictEqual(result.truncated, false);
		assert.strictEqual(result.text, payload);
		assert.strictEqual(parseQuantumIDEHostToolPayloadMeta(result.text), undefined);
	});

	test('AC-02-04: payload over 512KB returns truncation flag and fits budget', () => {
		const huge = 'x'.repeat(600_000);
		const result = truncateQuantumIDEHostToolPayload(huge, 'search_workspace_text');
		assert.strictEqual(result.truncated, true);
		assert.ok(result.originalBytes > QUANTUMIDE_HOST_TOOL_PAYLOAD_MAX_BYTES);
		assert.ok(utf8ByteLength(result.text) <= QUANTUMIDE_HOST_TOOL_PAYLOAD_MAX_BYTES);
		const meta = parseQuantumIDEHostToolPayloadMeta(result.text);
		assert.ok(meta);
		assert.strictEqual(meta!.truncated, true);
		assert.strictEqual(meta!.tool, 'search_workspace_text');
		assert.strictEqual(meta!.maxBytes, QUANTUMIDE_HOST_TOOL_PAYLOAD_MAX_BYTES);
	});

	test('applyQuantumIDEHostToolPayloadCap never throws on oversized string', () => {
		assert.doesNotThrow(() => applyQuantumIDEHostToolPayloadCap('y'.repeat(700_000), 'file_search'));
	});

	test('AC-02-04: executeOpenAIHostTool returns capped payload and agent path continues', async () => {
		const fileService = createFileService();
		const root = URI.file('/workspace');
		const file = URI.joinPath(root, 'big.txt');
		await fileService.writeFile(file, VSBuffer.fromString('LINE\n'.repeat(120_000)));
		const result = await executeOpenAIHostTool(fileService, root, 'read_workspace_file', { path: 'big.txt' });
		assert.ok(utf8ByteLength(result) <= QUANTUMIDE_HOST_TOOL_PAYLOAD_MAX_BYTES);
		const meta = parseQuantumIDEHostToolPayloadMeta(result);
		if (meta) {
			assert.strictEqual(meta.truncated, true);
		}
		assert.ok(result.includes('LINE') || meta?.truncated === true);
	});
});
