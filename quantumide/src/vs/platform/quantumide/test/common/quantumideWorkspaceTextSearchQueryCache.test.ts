/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import {
	getQuantumIDEPerfTelemetryCounters,
	QuantumIDEPerfTelemetryCounter,
	resetQuantumIDEPerfTelemetryForTests,
} from '../../common/quantumidePerfTelemetry.js';
import {
	bumpQuantumIDEWorkspaceGraphGeneration,
	resetQuantumIDEWorkspacePerformanceCoordinatorForTests,
} from '../../common/quantumideWorkspacePerformanceCoordinator.js';
import {
	buildQuantumIDEWorkspaceTextSearchCacheKey,
	resolveQuantumIDEWorkspaceTextSearch,
} from '../../common/quantumideWorkspaceTextSearchQueryCache.js';
import { verifyQuantumIDEWorkspaceTextSearchCacheAvoidsSecondSearch } from '../../common/quantumideWorkspaceTextSearchQueryCachePerformance.js';

suite('quantumideWorkspaceTextSearchQueryCache', () => {
	teardown(() => {
		resetQuantumIDEWorkspacePerformanceCoordinatorForTests();
		resetQuantumIDEPerfTelemetryForTests();
	});

	test('AC-04-04: repeated search hits L5 cache and logs hit counter', async () => {
		const result = await verifyQuantumIDEWorkspaceTextSearchCacheAvoidsSecondSearch();
		assert.strictEqual(result.searchCalls, 1);
		assert.ok(result.cacheHits >= 1);
	});

	test('generation bump invalidates cached query', async () => {
		let calls = 0;
		const run = async () => {
			calls++;
			return { matches: ['a.ts:1:x'], durationMs: 1 };
		};
		await resolveQuantumIDEWorkspaceTextSearch('/r', 'x', 5, '0', run);
		bumpQuantumIDEWorkspaceGraphGeneration();
		await resolveQuantumIDEWorkspaceTextSearch('/r', 'x', 5, '0', run);
		assert.strictEqual(calls, 2);
	});

	test('cache key includes generation', () => {
		resetQuantumIDEWorkspacePerformanceCoordinatorForTests();
		const k1 = buildQuantumIDEWorkspaceTextSearchCacheKey('/r', 'q', 10, '0');
		bumpQuantumIDEWorkspaceGraphGeneration();
		const k2 = buildQuantumIDEWorkspaceTextSearchCacheKey('/r', 'q', 10, '0');
		assert.notStrictEqual(k1, k2);
	});

	test('records queryCacheHit telemetry', async () => {
		await verifyQuantumIDEWorkspaceTextSearchCacheAvoidsSecondSearch();
		const counters = getQuantumIDEPerfTelemetryCounters();
		assert.ok((counters[QuantumIDEPerfTelemetryCounter.QueryCacheHit] ?? 0) >= 1);
		assert.ok((counters[QuantumIDEPerfTelemetryCounter.QueryCacheMiss] ?? 0) >= 1);
	});
});
