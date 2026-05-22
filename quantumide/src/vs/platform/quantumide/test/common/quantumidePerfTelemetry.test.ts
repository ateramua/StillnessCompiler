/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import {
	getQuantumIDEPerfTelemetryCounters,
	QuantumIDEPerfTelemetryCounter,
	recordQuantumIDEFastPathHit,
	recordQuantumIDEFastPathMiss,
	resetQuantumIDEPerfTelemetryForTests,
} from '../../common/quantumidePerfTelemetry.js';
import {
	getQuantumIDEWorkspaceDiscoveryTelemetryCounters,
	resetQuantumIDEWorkspaceDiscoveryTelemetryForTests,
} from '../../common/quantumideWorkspaceDiscoveryTelemetry.js';
import { QuantumIDEWorkspaceFastPath } from '../../common/quantumideWorkspaceFastPath.js';
import { buildQuantumIDEWarmFastPathFixtureGraph } from '../../common/quantumideWorkspaceFastPathPerformance.js';

suite('quantumidePerfTelemetry', () => {
	teardown(() => {
		resetQuantumIDEPerfTelemetryForTests();
	});

	test('AC-02-05: fastPathHit and fastPathMiss counters are exported', () => {
		recordQuantumIDEFastPathHit(3);
		recordQuantumIDEFastPathMiss(2);
		const perf = getQuantumIDEPerfTelemetryCounters();
		assert.strictEqual(perf[QuantumIDEPerfTelemetryCounter.FastPathHit], 3);
		assert.strictEqual(perf[QuantumIDEPerfTelemetryCounter.FastPathMiss], 2);
	});

	test('discovery telemetry merge includes qide.perf counters', () => {
		resetQuantumIDEWorkspaceDiscoveryTelemetryForTests();
		recordQuantumIDEFastPathHit();
		const merged = getQuantumIDEWorkspaceDiscoveryTelemetryCounters();
		assert.strictEqual(merged[QuantumIDEPerfTelemetryCounter.FastPathHit], 1);
		assert.strictEqual(merged[QuantumIDEPerfTelemetryCounter.FastPathMiss], 0);
	});

	test('workspace fast path records hits and misses to telemetry', () => {
		const graph = buildQuantumIDEWarmFastPathFixtureGraph(3);
		const fastPath = new QuantumIDEWorkspaceFastPath();
		fastPath.warmFromGraph(graph);
		fastPath.resetCounters();
		resetQuantumIDEPerfTelemetryForTests();
		fastPath.exists('src/file0.ts');
		fastPath.exists('nope.ts');
		const perf = getQuantumIDEPerfTelemetryCounters();
		assert.strictEqual(perf[QuantumIDEPerfTelemetryCounter.FastPathHit], 1);
		assert.strictEqual(perf[QuantumIDEPerfTelemetryCounter.FastPathMiss], 1);
		assert.strictEqual(fastPath.counters.hits, 1);
		assert.strictEqual(fastPath.counters.misses, 1);
	});
});
