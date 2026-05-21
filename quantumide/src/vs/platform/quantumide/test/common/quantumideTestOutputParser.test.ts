/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { formatTestRunSummary, parseTestOutput } from '../../common/quantumideTestOutputParser.js';

suite('quantumideTestOutputParser', () => {
	test('parses vitest summary', () => {
		const summary = parseTestOutput('Tests  12 passed | 1 failed', 'vitest');
		assert.strictEqual(summary.passed, 12);
		assert.strictEqual(summary.failed, 1);
		assert.strictEqual(summary.framework, 'vitest');
	});

	test('parses jest summary', () => {
		const summary = parseTestOutput('Tests:       2 failed, 10 passed, 12 total');
		assert.strictEqual(summary.passed, 10);
		assert.strictEqual(summary.failed, 2);
		assert.strictEqual(summary.framework, 'jest');
	});

	test('formatTestRunSummary includes counts', () => {
		const text = formatTestRunSummary({
			framework: 'pytest',
			passed: 5,
			failed: 1,
			skipped: 0,
			total: 6,
			failures: [{ testName: 'test_auth' }],
		});
		assert.ok(text.includes('5 passed'));
		assert.ok(text.includes('test_auth'));
	});
});
