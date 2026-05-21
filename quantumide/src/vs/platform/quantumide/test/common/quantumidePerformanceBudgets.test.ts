/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import {
	assertWithinBudget,
	QuantumIDEPerformanceBudgetError,
	QuantumIDEPerformanceBudgetMs,
	setQuantumIDEPerformanceBudgetEnforcement,
} from '../../common/quantumidePerformanceBudgets.js';

suite('QuantumIDE performance budgets (§6)', () => {
	teardown(() => {
		setQuantumIDEPerformanceBudgetEnforcement(false);
	});

	test('within budget does not throw when enforcement enabled', () => {
		setQuantumIDEPerformanceBudgetEnforcement(true);
		assert.doesNotThrow(() => assertWithinBudget('inlineCompletion', 50, QuantumIDEPerformanceBudgetMs.inlineCompletion));
	});

	test('exceeding budget throws when enforcement enabled', () => {
		setQuantumIDEPerformanceBudgetEnforcement(true);
		assert.throws(
			() => assertWithinBudget('chatStartup', 5000, QuantumIDEPerformanceBudgetMs.chatStartup),
			err => err instanceof QuantumIDEPerformanceBudgetError,
		);
	});

	test('§6 targets are defined for CI regression', () => {
		assert.strictEqual(QuantumIDEPerformanceBudgetMs.chatStartup, 1500);
		assert.strictEqual(QuantumIDEPerformanceBudgetMs.inlineCompletion, 200);
		assert.strictEqual(QuantumIDEPerformanceBudgetMs.semanticRetrieval, 300);
		assert.strictEqual(QuantumIDEPerformanceBudgetMs.diffRendering, 100);
	});
});
