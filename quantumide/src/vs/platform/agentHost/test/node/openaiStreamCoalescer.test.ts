/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { computeAdaptiveCoalesceMs, countWords, OpenAIStreamCoalescer } from '../../node/openai/openaiStreamCoalescer.js';

suite('OpenAIStreamCoalescer', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('countWords ignores extra whitespace', () => {
		assert.strictEqual(countWords(' hello   world '), 2);
	});

	test('computeAdaptiveCoalesceMs increases delay for slow streams', () => {
		const slow = computeAdaptiveCoalesceMs(24, 80, 3, 2000, true);
		const fast = computeAdaptiveCoalesceMs(24, 80, 120, 2000, true);
		assert.ok(slow > fast);
	});

	test('flushes immediately when coalesceMs is zero', () => {
		const flushed: string[] = [];
		const coalescer = new OpenAIStreamCoalescer(content => flushed.push(content), {
			baseCoalesceMs: 0,
			maxCoalesceMs: 0,
			maxBurstChars: 512,
			adaptiveCoalescing: false,
		});
		coalescer.enqueue('a');
		coalescer.enqueue('b');
		coalescer.dispose();
		assert.deepStrictEqual(flushed, ['a', 'b']);
	});

	test('batches small chunks until flush is requested', () => {
		const flushed: string[] = [];
		const coalescer = new OpenAIStreamCoalescer(content => flushed.push(content), {
			baseCoalesceMs: 10_000,
			maxCoalesceMs: 10_000,
			maxBurstChars: 512,
			adaptiveCoalescing: false,
		});
		coalescer.enqueue('hel');
		coalescer.enqueue('lo');
		assert.strictEqual(flushed.length, 0);
		coalescer.flush();
		coalescer.dispose();
		assert.deepStrictEqual(flushed, ['hello']);
	});

	test('records timeToFirstEmitMs', () => {
		const coalescer = new OpenAIStreamCoalescer(() => { }, {
			baseCoalesceMs: 0,
			maxCoalesceMs: 0,
			maxBurstChars: 512,
			adaptiveCoalescing: false,
		});
		coalescer.enqueue('x');
		const metrics = coalescer.getMetrics();
		coalescer.dispose();
		assert.strictEqual(metrics.deltaCount, 1);
		assert.ok(typeof metrics.timeToFirstEmitMs === 'number');
	});
});
