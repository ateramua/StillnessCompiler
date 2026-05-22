/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { executeOpenAIHostTool } from '../../../agentHost/node/openai/openaiHostTools.js';
import { FileService } from '../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import {
	measureQuantumIDEReadonlyWriteRejectCallMs,
	QUANTUMIDE_WORKSPACE_READONLY_WRITE_FAIL_BUDGET_MS,
	resetQuantumIDEWorkspaceReadonlyTelemetryForTests,
	tryRejectQuantumIDEReadonlyWriteTool,
} from '../../common/quantumideWorkspaceReadonly.js';

suite('quantumideWorkspaceReadonlyWritePerformance', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => {
		resetQuantumIDEWorkspaceReadonlyTelemetryForTests();
	});

	test('AC-03-04: cached readonly write reject ≤ 5ms', () => {
		const samples: number[] = [];
		for (let i = 0; i < 200; i++) {
			samples.push(measureQuantumIDEReadonlyWriteRejectCallMs('apply_workspace_edits', true, { autoApplyEdits: true }));
		}
		samples.sort((a, b) => a - b);
		const p95 = samples[Math.floor(samples.length * 0.95)] ?? 0;
		assert.ok(
			p95 < QUANTUMIDE_WORKSPACE_READONLY_WRITE_FAIL_BUDGET_MS,
			`readonly write reject P95 ${p95.toFixed(3)}ms exceeds ${QUANTUMIDE_WORKSPACE_READONLY_WRITE_FAIL_BUDGET_MS}ms`,
		);
		assert.ok(tryRejectQuantumIDEReadonlyWriteTool('propose_file_edit', true)?.includes('read-only'));
	});

	test('AC-03-04: executeOpenAIHostTool write path fails fast with cached readonly', async () => {
		const fileService = disposables.add(new FileService(new NullLogService()));
		const provider = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider(Schemas.file, provider));
		const root = URI.file('/readonly-perf');
		await fileService.createFolder(root);
		provider.setReadOnly(true);

		const start = performance.now();
		const result = await executeOpenAIHostTool(
			fileService,
			root,
			'apply_workspace_edits',
			{ edits: [{ operation: 'write', path: 'x.ts', content: 'export {};\n' }] },
			{ autoApplyEdits: true, workspaceReadonly: true },
		);
		const elapsed = performance.now() - start;
		assert.ok(result.includes('read-only'));
		assert.ok(
			elapsed < QUANTUMIDE_WORKSPACE_READONLY_WRITE_FAIL_BUDGET_MS,
			`executeOpenAIHostTool readonly reject ${elapsed.toFixed(3)}ms exceeds ${QUANTUMIDE_WORKSPACE_READONLY_WRITE_FAIL_BUDGET_MS}ms`,
		);
	});
});
