/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { tryQuantumIDEAgentFsSimpleFastLane } from '../../common/quantumideAgentFastLane.js';
import { profileForQuantumIDEAgentResponseMode, resolveQuantumIDEAgentResponseMode } from '../../common/quantumideAgentResponseMode.js';
import { buildQuantumIDEWorkspaceAgentSnapshot } from '../../common/quantumideWorkspaceSnapshotBridge.js';
import { createEmptyQuantumIDEWorkspaceGraph } from '../../common/quantumideWorkspaceGraph.js';
import { runQuantumIDEAgentNearInstantBenchmarks, QUANTUMIDE_AGENT_NEAR_INSTANT_BUDGETS } from '../../common/quantumideAgentNearInstantBenchmarks.js';
import { partitionQuantumIDEAgentToolCalls } from '../../common/quantumideAgentToolBatch.js';
import { QuantumIDEAgentContextTracker } from '../../common/quantumideAgentContextTracker.js';
import { resetQuantumIDEPerfHistogramsForTests, recordQuantumIDEPerfHistogramSample, getQuantumIDEPerfHistogram } from '../../common/quantumidePerfHistogram.js';

suite('QuantumIDE agent near-instant requirements', () => {
	test('Req-05: fs_simple fast lane answers existence from snapshot', () => {
		const graph = createEmptyQuantumIDEWorkspaceGraph('w', [{ name: 'Root', uri: 'file:///Root' }], 'ok');
		const files = [{ uri: 'f', workspaceRelativePath: 'Root/src/app.ts', name: 'app.ts', extension: '.ts' }];
		const snapshot = buildQuantumIDEWorkspaceAgentSnapshot({ ...graph, files, status: { indexed: true, reason: 't' } }, 1);
		const result = tryQuantumIDEAgentFsSimpleFastLane('Does Root/src/app.ts exist?', snapshot);
		assert.strictEqual(result.handled, true);
		assert.ok(result.response?.includes('app.ts'));
		assert.ok(result.durationMs < QUANTUMIDE_AGENT_NEAR_INSTANT_BUDGETS.fastLaneMs);
	});

	test('Req-06/09: response mode profiles fast vs safe', () => {
		assert.strictEqual(resolveQuantumIDEAgentResponseMode('fast', 'full'), 'fast');
		const fast = profileForQuantumIDEAgentResponseMode('fast', 'lite');
		const safe = profileForQuantumIDEAgentResponseMode('safe', 'full');
		assert.ok(fast.maxToolIterations < safe.maxToolIterations);
		assert.strictEqual(fast.allowFastLane, true);
		assert.strictEqual(safe.allowFastLane, false);
	});

	test('Req-03: partition read-only tools for parallel batch', () => {
		const { parallel, serial } = partitionQuantumIDEAgentToolCalls([
			{ id: '1', name: 'read_workspace_file', args: { path: 'a.ts' } },
			{ id: '2', name: 'search_workspace_text', args: { query: 'x' } },
			{ id: '3', name: 'apply_workspace_edits', args: {} },
		]);
		assert.strictEqual(parallel.length, 2);
		assert.strictEqual(serial.length, 1);
	});

	test('Req-04: context tracker delta detection', () => {
		const tracker = new QuantumIDEAgentContextTracker('s1');
		tracker.recordLoaded('src/a.ts', 'fp1');
		assert.strictEqual(tracker.needsFetch('src/a.ts', 'fp1'), false);
		assert.strictEqual(tracker.needsFetch('src/a.ts', 'fp2'), true);
		tracker.recordRecentPath('src/b.ts');
		assert.ok(tracker.predictPrefetchPaths().includes('src/b.ts'));
	});

	test('Req-12: near-instant benchmarks meet warm simple budget', () => {
		const bench = runQuantumIDEAgentNearInstantBenchmarks();
		assert.ok(bench.meetsFastLane, `fastLaneP95=${bench.fastLaneP95Ms}`);
		assert.ok(bench.meetsWarmSimple, `warmExists=${bench.warmExistsP95Ms}`);
	});

	test('Req-08: perf histogram records samples', () => {
		resetQuantumIDEPerfHistogramsForTests();
		recordQuantumIDEPerfHistogramSample('agent-read', 12);
		recordQuantumIDEPerfHistogramSample('agent-read', 18);
		const h = getQuantumIDEPerfHistogram('agent-read');
		assert.ok(h && h.count === 2);
	});
});
