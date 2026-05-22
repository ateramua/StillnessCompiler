/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import {
	measureQuantumIDESemanticIncrementalCoreP95Ms,
	QUANTUMIDE_SEMANTIC_INCREMENTAL_FILE_BUDGET_MS,
} from '../../common/quantumideSemanticIncrementalPerformance.js';
import { QuantumIDEPerformanceBudgetMs } from '../../common/quantumidePerformanceBudgets.js';

suite('quantumideSemanticIncrementalPerformance', () => {
	test('AC-01-04: active file incremental core P95 ≤ 500ms', () => {
		const { p95Ms, path } = measureQuantumIDESemanticIncrementalCoreP95Ms(80);
		assert.ok(path.includes('EditorWidget'));
		assert.strictEqual(QuantumIDEPerformanceBudgetMs.semanticIncrementalFile, QUANTUMIDE_SEMANTIC_INCREMENTAL_FILE_BUDGET_MS);
		assert.ok(
			p95Ms < QUANTUMIDE_SEMANTIC_INCREMENTAL_FILE_BUDGET_MS,
			`semantic incremental P95 ${p95Ms.toFixed(2)}ms exceeds ${QUANTUMIDE_SEMANTIC_INCREMENTAL_FILE_BUDGET_MS}ms`,
		);
	});
});
