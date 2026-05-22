/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import {
	estimateQuantumIDEWorkspaceCacheMemoryFromPaths,
	isQuantumIDEWorkspaceCacheWithinMemoryBudget,
	QUANTUMIDE_DEFAULT_MEMORY_BUDGET_MB,
	QUANTUMIDE_LARGE_PATH_COUNT_THRESHOLD,
} from '../../common/quantumideWorkspaceMemoryBudget.js';
import {
	buildQuantumIDE100kFixturePaths,
	measureQuantumIDE100kWorkspaceCacheMemory,
	QUANTUMIDE_100K_MEMORY_BUDGET_MB,
} from '../../common/quantumideWorkspace100kMemoryPerformance.js';
import {
	getQuantumIDEL2PrefixPathCache,
	getQuantumIDEL5QueryResultCache,
	resetQuantumIDEWorkspacePerformanceCoordinatorForTests,
	setQuantumIDEMemoryBudgetMb,
	syncQuantumIDEL2PrefixCache,
} from '../../common/quantumideWorkspacePerformanceCoordinator.js';

suite('quantumideWorkspaceMemoryBudget', () => {
	teardown(() => {
		resetQuantumIDEWorkspacePerformanceCoordinatorForTests();
	});

	test('100k path estimate stays within default 512MB budget', () => {
		const paths = buildQuantumIDE100kFixturePaths();
		const estimate = estimateQuantumIDEWorkspaceCacheMemoryFromPaths(paths);
		assert.ok(isQuantumIDEWorkspaceCacheWithinMemoryBudget(estimate));
		assert.ok(estimate.totalMb < QUANTUMIDE_DEFAULT_MEMORY_BUDGET_MB);
	});

	test('MEM-03: L2 uses compact basename index above 50k paths', () => {
		const paths = buildQuantumIDE100kFixturePaths();
		assert.ok(paths.length > QUANTUMIDE_LARGE_PATH_COUNT_THRESHOLD);
		syncQuantumIDEL2PrefixCache(paths);
		const l2 = getQuantumIDEL2PrefixPathCache();
		assert.ok(l2.usesCompactBasenameIndex);
	});

	test('AC-04-03: 100k fixture memory measurement within budget', () => {
		const result = measureQuantumIDE100kWorkspaceCacheMemory();
		assert.strictEqual(result.pathCount, 100_000);
		assert.ok(result.withinBudget, `estimated=${result.estimatedMb.toFixed(1)}MB heap=${result.heapDeltaMb.toFixed(1)}MB`);
		assert.ok(result.estimatedMb <= QUANTUMIDE_100K_MEMORY_BUDGET_MB);
	});

	test('MEM-04: coordinator evicts L5 when budget exceeded', () => {
		setQuantumIDEMemoryBudgetMb(1);
		const paths = buildQuantumIDE100kFixturePaths();
		syncQuantumIDEL2PrefixCache(paths);
		const l5 = getQuantumIDEL5QueryResultCache();
		l5.set('probe', 'value');
		syncQuantumIDEL2PrefixCache(paths);
		assert.strictEqual(l5.size, 0);
	});
});
