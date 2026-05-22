/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import {
	computeQuantumIDEMultiRootScanConcurrency,
	QUANTUMIDE_PARALLEL_ROOT_SCAN_MAX_CONCURRENCY,
	runQuantumIDERootScansInParallel,
} from '../../common/quantumideParallelRootScan.js';
import {
	measureQuantumIDE5RootParallelLiteScanMs,
	QUANTUMIDE_5_ROOT_LITE_WALL_BUDGET_MS,
} from '../../common/quantumideLiteGraphParallelPerformance.js';

suite('quantumideParallelRootScan', () => {
	test('CON-01: concurrency capped at min(roots, 4)', () => {
		assert.strictEqual(computeQuantumIDEMultiRootScanConcurrency(1), 1);
		assert.strictEqual(computeQuantumIDEMultiRootScanConcurrency(5), QUANTUMIDE_PARALLEL_ROOT_SCAN_MAX_CONCURRENCY);
		assert.strictEqual(computeQuantumIDEMultiRootScanConcurrency(10), QUANTUMIDE_PARALLEL_ROOT_SCAN_MAX_CONCURRENCY);
	});

	test('preserves root order in results', async () => {
		const results = await runQuantumIDERootScansInParallel(
			['a', 'b', 'c', 'd', 'e'],
			async name => name.toUpperCase(),
			4,
		);
		assert.deepStrictEqual(results, ['A', 'B', 'C', 'D', 'E']);
	});

	test('AC-04-02: 5-root parallel lite wall clock within 10s', async () => {
		const { wallMs } = await measureQuantumIDE5RootParallelLiteScanMs();
		assert.ok(
			wallMs <= QUANTUMIDE_5_ROOT_LITE_WALL_BUDGET_MS,
			`5-root parallel lite ${wallMs.toFixed(0)}ms > ${QUANTUMIDE_5_ROOT_LITE_WALL_BUDGET_MS}ms`,
		);
	});
});
