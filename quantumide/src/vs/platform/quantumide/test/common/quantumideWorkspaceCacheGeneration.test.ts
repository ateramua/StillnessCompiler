/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import {
	bumpQuantumIDEWorkspaceGraphGeneration,
	getQuantumIDEL2PrefixPathCache,
	getQuantumIDEL5QueryResultCache,
	resetQuantumIDEWorkspacePerformanceCoordinatorForTests,
} from '../../common/quantumideWorkspacePerformanceCoordinator.js';
import {
	measureQuantumIDEGenerationBumpClearL2L5Ms,
	QUANTUMIDE_CACHE_GENERATION_CLEAR_BUDGET_MS,
} from '../../common/quantumideWorkspaceCacheGenerationPerformance.js';
import { QUANTUMIDE_QUERY_CACHE_MAX_ENTRIES } from '../../common/quantumideQueryResultCache.js';

suite('quantumideWorkspaceCacheGeneration', () => {
	teardown(() => {
		resetQuantumIDEWorkspacePerformanceCoordinatorForTests();
	});

	test('generation bump clears L2 and L5', () => {
		const paths = ['src/a.ts', 'src/b.ts'];
		bumpQuantumIDEWorkspaceGraphGeneration(paths);
		const l2 = getQuantumIDEL2PrefixPathCache();
		const l5 = getQuantumIDEL5QueryResultCache();
		l5.set('q1', 'hits');
		assert.strictEqual(l2.pathCount, 2);
		assert.strictEqual(l5.size, 1);
		const bump = bumpQuantumIDEWorkspaceGraphGeneration();
		assert.strictEqual(l2.pathCount, 0);
		assert.strictEqual(l5.size, 0);
		assert.ok(bump.generation >= 2);
	});

	test('L5 respects generation and TTL', () => {
		bumpQuantumIDEWorkspaceGraphGeneration();
		const l5 = getQuantumIDEL5QueryResultCache();
		l5.set('k', 'v', 1000);
		assert.strictEqual(l5.get('k', 1000), 'v');
		bumpQuantumIDEWorkspaceGraphGeneration();
		assert.strictEqual(l5.get('k', 2000), undefined);
	});

	test('AC-04-01: warm L2/L5 clear within 100ms on generation bump', () => {
		const { clearDurationMs, l2After, l5After } = measureQuantumIDEGenerationBumpClearL2L5Ms();
		assert.strictEqual(l2After, 0);
		assert.strictEqual(l5After, 0);
		assert.ok(
			clearDurationMs <= QUANTUMIDE_CACHE_GENERATION_CLEAR_BUDGET_MS,
			`generation bump clear ${clearDurationMs.toFixed(2)}ms > ${QUANTUMIDE_CACHE_GENERATION_CLEAR_BUDGET_MS}ms`,
		);
	});

	test('L5 enforces max entry count', () => {
		bumpQuantumIDEWorkspaceGraphGeneration();
		const l5 = getQuantumIDEL5QueryResultCache();
		for (let i = 0; i < QUANTUMIDE_QUERY_CACHE_MAX_ENTRIES + 20; i++) {
			l5.set(`k${i}`, `v${i}`);
		}
		assert.strictEqual(l5.size, QUANTUMIDE_QUERY_CACHE_MAX_ENTRIES);
	});
});
