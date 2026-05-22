/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import {
	computeQuantumIDEWorkspaceTextSearchP95Ms,
	QUANTUMIDE_WORKSPACE_TEXT_SEARCH_SAMPLE_P95_BUDGET_MS,
} from '../../../quantumide/common/quantumideWorkspaceTextSearchPerformance.js';
import { searchQuantumIDEWorkspaceTextWithRipgrep } from '../../node/quantumideWorkspaceTextSearch.js';

suite('quantumideWorkspaceTextSearch', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('ripgrep finds fixed-string matches with line numbers', async function () {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qide-rg-'));
		try {
			fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
			fs.writeFileSync(path.join(dir, 'src', 'alpha.ts'), 'export const QUANTUMIDE_NEEDLE = 1;\n');
			fs.writeFileSync(path.join(dir, 'src', 'beta.ts'), 'export const other = 2;\n');
			const result = await searchQuantumIDEWorkspaceTextWithRipgrep(dir, 'QUANTUMIDE_NEEDLE', 10);
			assert.ok(result, 'expected ripgrep result');
			assert.strictEqual(result.engine, 'ripgrep');
			assert.ok(result.matches.length >= 1);
			assert.ok(result.matches[0].includes('QUANTUMIDE_NEEDLE'));
			assert.ok(result.durationMs >= 0);
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	test('sample-tree P95 stays within verify budget', async function () {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qide-rg-perf-'));
		try {
			fs.mkdirSync(path.join(dir, 'pkg'), { recursive: true });
			for (let i = 0; i < 400; i++) {
				fs.writeFileSync(
					path.join(dir, 'pkg', `file${i}.ts`),
					`// token-${i}\nexport const value${i} = 'QUANTUMIDE_PERF_TOKEN';\n`,
				);
			}
			const samples: number[] = [];
			for (let r = 0; r < 12; r++) {
				const result = await searchQuantumIDEWorkspaceTextWithRipgrep(dir, 'QUANTUMIDE_PERF_TOKEN', 5);
				assert.ok(result);
				samples.push(result.durationMs);
			}
			const p95 = computeQuantumIDEWorkspaceTextSearchP95Ms(samples);
			assert.ok(
				p95 < QUANTUMIDE_WORKSPACE_TEXT_SEARCH_SAMPLE_P95_BUDGET_MS,
				`expected sample P95 < ${QUANTUMIDE_WORKSPACE_TEXT_SEARCH_SAMPLE_P95_BUDGET_MS}ms, got ${p95.toFixed(2)}ms`,
			);
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});
});
