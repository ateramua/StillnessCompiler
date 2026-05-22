/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { quantumideFuzzyMatchFilePaths } from '../../common/quantumideFuzzyFileMatch.js';
import {
	measureQuantumIDEAtMentionFuzzyMatchMs,
	QUANTUMIDE_AT_MENTION_MATCH_BUDGET_MS,
} from '../../common/quantumideAtMentionPerformance.js';

suite('quantumideAtMentionPerformance', () => {
	test('partial filename match on 5k warm paths stays within budget', () => {
		const paths = Array.from({ length: 5_000 }, (_, i) => `Root${i % 5}/src/file${i}.ts`);
		const matches = quantumideFuzzyMatchFilePaths('file42', paths, 20);
		assert.ok(matches.length > 0);
		assert.ok(matches[0].path.includes('file42'));
		const avgMs = measureQuantumIDEAtMentionFuzzyMatchMs(paths, 'file4', 40);
		assert.ok(
			avgMs < QUANTUMIDE_AT_MENTION_MATCH_BUDGET_MS,
			`expected avg fuzzy match < ${QUANTUMIDE_AT_MENTION_MATCH_BUDGET_MS}ms, got ${avgMs.toFixed(2)}ms`,
		);
	});
});
