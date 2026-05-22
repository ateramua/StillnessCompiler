/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import {
	appendPartialContextFooter,
	assertWithinBudget,
	QuantumIDEPerformanceBudgetError,
	QuantumIDEPerformanceBudgetMs,
	QUANTUMIDE_PARTIAL_CONTEXT_FOOTER,
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
		assert.strictEqual(QuantumIDEPerformanceBudgetMs.chatContextBuild, 500);
		assert.strictEqual(QuantumIDEPerformanceBudgetMs.inlineCompletion, 200);
		assert.strictEqual(QuantumIDEPerformanceBudgetMs.semanticRetrieval, 300);
		assert.strictEqual(QuantumIDEPerformanceBudgetMs.diffRendering, 100);
	});

	test('appendPartialContextFooter adds NFR-CC-01 notice when degraded', () => {
		const body = appendPartialContextFooter('## Workspace\n\nsnapshot', true);
		assert.ok(body.includes('[QuantumIDE] Partial context'));
		assert.ok(body.length > '## Workspace\n\nsnapshot'.length + QUANTUMIDE_PARTIAL_CONTEXT_FOOTER.length - 10);
		assert.strictEqual(appendPartialContextFooter('same', false), 'same');
	});
});
