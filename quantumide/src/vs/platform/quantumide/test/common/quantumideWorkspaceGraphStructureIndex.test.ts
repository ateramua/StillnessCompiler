/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import {
	buildQuantumIDEWorkspaceGraphStructureIndex,
	normalizeQuantumIDEStructurePath,
} from '../../common/quantumideWorkspaceGraphStructureIndex.js';
import {
	computeQuantumIDEStructuralQueryP95Ms,
	measureQuantumIDEStructuralQuerySamples,
	QUANTUMIDE_STRUCTURAL_QUERY_P95_BUDGET_MS,
} from '../../common/quantumideWorkspaceStructuralQueryPerformance.js';

suite('quantumideWorkspaceGraphStructureIndex', () => {
	test('normalizeQuantumIDEStructurePath', () => {
		assert.strictEqual(normalizeQuantumIDEStructurePath('.'), '.');
		assert.strictEqual(normalizeQuantumIDEStructurePath('./src/foo'), 'src/foo');
	});

	test('listImmediateChildren and pathExists', () => {
		const index = buildQuantumIDEWorkspaceGraphStructureIndex([
			'src/a.ts',
			'src/pkg/b.ts',
			'docs/readme.md',
		]);
		assert.ok(index.pathExists('src'));
		assert.ok(index.pathExists('src/a.ts'));
		assert.ok(!index.pathExists('missing.ts'));
		const srcChildren = index.listImmediateChildren('src');
		assert.ok(srcChildren.some(c => c.name === 'a.ts' && c.kind === 'file'));
		assert.ok(srcChildren.some(c => c.name === 'pkg' && c.kind === 'directory'));
	});

	test('AC-01-01: 100k paths structural exists and list_dir P95 under budget', () => {
		const paths = Array.from({ length: 100_000 }, (_, i) => `src/pkg${i % 500}/module${i}.ts`);
		const buildStart = performance.now();
		const index = buildQuantumIDEWorkspaceGraphStructureIndex(paths);
		const buildMs = performance.now() - buildStart;
		assert.strictEqual(index.fileCount, 100_000);

		const existsSamples = measureQuantumIDEStructuralQuerySamples(80, () => {
			index.pathExists(`src/pkg${37}/module${9001}.ts`);
			index.pathExists('src/pkg37/module9001.ts');
			index.pathExists('nope/missing.ts');
		});
		const listSamples = measureQuantumIDEStructuralQuerySamples(80, () => {
			index.listImmediateChildren('.');
			index.listImmediateChildren('src/pkg12');
		});

		const existsP95 = computeQuantumIDEStructuralQueryP95Ms(existsSamples);
		const listP95 = computeQuantumIDEStructuralQueryP95Ms(listSamples);
		assert.ok(
			existsP95 < QUANTUMIDE_STRUCTURAL_QUERY_P95_BUDGET_MS,
			`exists P95 ${existsP95.toFixed(2)}ms exceeds ${QUANTUMIDE_STRUCTURAL_QUERY_P95_BUDGET_MS}ms (build ${buildMs.toFixed(0)}ms)`,
		);
		assert.ok(
			listP95 < QUANTUMIDE_STRUCTURAL_QUERY_P95_BUDGET_MS,
			`list_dir P95 ${listP95.toFixed(2)}ms exceeds ${QUANTUMIDE_STRUCTURAL_QUERY_P95_BUDGET_MS}ms`,
		);
	});
});
