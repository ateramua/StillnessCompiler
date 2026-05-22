/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import {
	buildQuantumIDEWarmFastPathFixtureGraph,
	measureQuantumIDEWarmExistsBatchFromGraphMs,
	measureQuantumIDEWarmExistsBatchMs,
	QUANTUMIDE_FAST_PATH_EXISTS_WARM_BATCH_BUDGET_MS,
	QUANTUMIDE_FAST_PATH_EXISTS_WARM_BATCH_SIZE,
} from '../../common/quantumideWorkspaceFastPathPerformance.js';
import {
	normalizeQuantumIDEWorkspaceFastPath,
	QuantumIDEWorkspaceFastPath,
} from '../../common/quantumideWorkspaceFastPath.js';
import { resetQuantumIDEPerfTelemetryForTests } from '../../common/quantumidePerfTelemetry.js';

suite('quantumideWorkspaceFastPath', () => {
	teardown(() => {
		resetQuantumIDEPerfTelemetryForTests();
	});

	test('normalize strips leading ./ and trailing slashes', () => {
		assert.strictEqual(normalizeQuantumIDEWorkspaceFastPath('./src/a.ts'), 'src/a.ts');
		assert.strictEqual(normalizeQuantumIDEWorkspaceFastPath('src\\b.ts'), 'src/b.ts');
	});

	test('listImmediateChildren returns warmed structure index children', () => {
		const graph = buildQuantumIDEWarmFastPathFixtureGraph(5);
		const fastPath = new QuantumIDEWorkspaceFastPath();
		fastPath.warmFromGraph(graph);
		const children = fastPath.listImmediateChildren('src');
		assert.ok(children.some(c => c.name === 'file0.ts' && c.kind === 'file'));
	});

	test('exists hits indexed files and parent directories', () => {
		const graph = buildQuantumIDEWarmFastPathFixtureGraph(3);
		const fastPath = new QuantumIDEWorkspaceFastPath();
		fastPath.warmFromGraph(graph);
		assert.deepStrictEqual(fastPath.exists('src/file1.ts'), { exists: true, isFile: true, hit: true });
		assert.deepStrictEqual(fastPath.exists('src'), { exists: true, isDirectory: true, hit: true });
		assert.strictEqual(fastPath.exists('missing.ts').exists, false);
		assert.strictEqual(fastPath.exists('missing.ts').hit, false);
		assert.ok(fastPath.exists('missing.ts').stale);
	});

	test('L0 cache serves repeat exists without graph lookup', () => {
		const graph = buildQuantumIDEWarmFastPathFixtureGraph(1);
		const fastPath = new QuantumIDEWorkspaceFastPath();
		fastPath.warmFromGraph(graph);
		fastPath.resetCounters();
		fastPath.exists('src/file0.ts');
		fastPath.exists('src/file0.ts');
		assert.strictEqual(fastPath.counters.hits, 2);
		assert.strictEqual(fastPath.counters.misses, 0);
	});

	test('AC-02-01: 1000 sequential warm exists complete within budget', () => {
		const { totalMs, hits, misses } = measureQuantumIDEWarmExistsBatchFromGraphMs();
		assert.strictEqual(hits, QUANTUMIDE_FAST_PATH_EXISTS_WARM_BATCH_SIZE);
		assert.strictEqual(misses, 0);
		assert.ok(
			totalMs <= QUANTUMIDE_FAST_PATH_EXISTS_WARM_BATCH_BUDGET_MS,
			`expected ${QUANTUMIDE_FAST_PATH_EXISTS_WARM_BATCH_SIZE} warm exists <= ${QUANTUMIDE_FAST_PATH_EXISTS_WARM_BATCH_BUDGET_MS}ms, got ${totalMs.toFixed(2)}ms`,
		);
	});

	test('disabled fast path reports miss', () => {
		const graph = buildQuantumIDEWarmFastPathFixtureGraph(1);
		const fastPath = new QuantumIDEWorkspaceFastPath();
		fastPath.warmFromGraph(graph);
		fastPath.setEnabled(false);
		const result = fastPath.exists('src/file0.ts');
		assert.strictEqual(result.hit, false);
		assert.ok(result.stale);
	});

	test('graph refresh invalidates stat cache', () => {
		const graph = buildQuantumIDEWarmFastPathFixtureGraph(1);
		const fastPath = new QuantumIDEWorkspaceFastPath();
		fastPath.warmFromGraph(graph);
		fastPath.exists('src/file0.ts');
		fastPath.warmFromGraph(buildQuantumIDEWarmFastPathFixtureGraph(2));
		assert.strictEqual(fastPath.exists('src/file0.ts').exists, true);
		assert.strictEqual(fastPath.exists('src/file1.ts').exists, true);
		assert.strictEqual(fastPath.exists('src/removed.ts').exists, false);
	});

	test('measureQuantumIDEWarmExistsBatchMs uses provided paths', () => {
		const graph = buildQuantumIDEWarmFastPathFixtureGraph(100);
		const fastPath = new QuantumIDEWorkspaceFastPath();
		fastPath.warmFromGraph(graph);
		const paths = graph.files.map(f => f.workspaceRelativePath);
		for (const p of paths) {
			fastPath.exists(p);
		}
		const totalMs = measureQuantumIDEWarmExistsBatchMs(fastPath, paths, 200);
		assert.ok(totalMs < QUANTUMIDE_FAST_PATH_EXISTS_WARM_BATCH_BUDGET_MS * 2);
	});
});
