/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import {
	compareQuantumIDEIndexingMainThreadIsolation,
	isQuantumIDEIndexingIsolationAcceptable,
	QUANTUMIDE_INDEXER_WORKER_SLICE_YIELD_MS,
} from '../../common/quantumideIndexingMainThreadIsolation.js';
import { QUANTUMIDE_MAIN_THREAD_LONG_TASK_MS } from '../../common/quantumideMainThreadLongTask.js';

suite('quantumideIndexingMainThreadIsolation', () => {
	test('AC-01-06: yielded indexing produces fewer main-thread long tasks than baseline', async () => {
		const result = await compareQuantumIDEIndexingMainThreadIsolation(200);
		assert.strictEqual(QUANTUMIDE_INDEXER_WORKER_SLICE_YIELD_MS, 16);
		assert.strictEqual(QUANTUMIDE_MAIN_THREAD_LONG_TASK_MS, 50);
		assert.ok(
			isQuantumIDEIndexingIsolationAcceptable(result),
			`baseline=${result.baselineLongTasks} isolated=${result.isolatedLongTasks} files=${result.fileCount}`,
		);
		assert.ok(result.isolatedLongTasks < result.baselineLongTasks);
	});
});
