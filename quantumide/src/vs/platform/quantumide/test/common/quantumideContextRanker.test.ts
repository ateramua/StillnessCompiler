/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import {
	formatOmittedSectionIdsSummary,
	formatRankedContext,
	rankAndTrimContextSections,
} from '../../common/quantumideContextRanker.js';

suite('quantumideContextRanker', () => {
	test('rankAndTrimContextSections omits low-priority sections when over char budget', () => {
		const { included, omitted } = rankAndTrimContextSections([
			{ id: 'workspace', title: '', body: 'x'.repeat(80), priority: 100 },
			{ id: 'comments-index', title: 'Comments', body: 'y'.repeat(80), priority: 45 },
			{ id: 'navigation', title: 'Nav', body: 'z'.repeat(80), priority: 40 },
		], 100);
		assert.strictEqual(included.length, 1);
		assert.strictEqual(included[0]?.id, 'workspace');
		assert.deepStrictEqual(omitted, ['comments-index', 'navigation']);
	});

	test('formatRankedContext lists omitted section ids', () => {
		const body = formatRankedContext(
			[{ id: 'workspace', title: 'Workspace', body: 'primary', priority: 100 }],
			['comments-index', 'navigation'],
		);
		assert.ok(body.includes('Omitted sections (2): comments-index, navigation'));
	});

	test('formatOmittedSectionIdsSummary returns empty for no omissions', () => {
		assert.strictEqual(formatOmittedSectionIdsSummary([]), '');
	});

	test('zero char budget omits all sections', () => {
		const { included, omitted } = rankAndTrimContextSections([
			{ id: 'a', title: '', body: 'a', priority: 1 },
		], 0);
		assert.strictEqual(included.length, 0);
		assert.deepStrictEqual(omitted, ['a']);
	});
});
