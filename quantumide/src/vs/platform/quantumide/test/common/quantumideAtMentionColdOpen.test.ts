/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { createEmptyQuantumIDEWorkspaceGraph } from '../../common/quantumideWorkspaceGraph.js';
import { buildQuantumIDEAtMentionPathsFromGraph } from '../../common/quantumideAtMentionPathCache.js';
import {
	measureQuantumIDEAtMentionColdOpenP95Ms,
	QUANTUMIDE_AT_MENTION_COLD_OPEN_BUDGET_MS,
	QUANTUMIDE_AT_MENTION_COLD_OPEN_PATH_COUNT,
} from '../../common/quantumideAtMentionPerformance.js';

suite('quantumideAtMentionColdOpen', () => {
	test('AC-01-03: cached 10k graph @ mention path build + fuzzy P95 < 400ms', () => {
		const empty = createEmptyQuantumIDEWorkspaceGraph('ws', [{ name: 'R', uri: 'file:///r' }], 'hydrated from storage (pre-lite-scan)');
		const files = Array.from({ length: QUANTUMIDE_AT_MENTION_COLD_OPEN_PATH_COUNT }, (_, i) => ({
			uri: `file:///r/src/file${i}.ts`,
			workspaceRelativePath: `R/src/file${i}.ts`,
			name: `file${i}.ts`,
			extension: '.ts',
		}));
		const graph = {
			...empty,
			files,
			status: { ...empty.status, indexed: true, reason: 'hydrated from storage (pre-lite-scan)' },
		};
		const paths = buildQuantumIDEAtMentionPathsFromGraph(graph);
		assert.ok(paths.length > 0);
		const { p95Ms, pathCount } = measureQuantumIDEAtMentionColdOpenP95Ms(graph, 'file42', 80);
		assert.ok(
			p95Ms < QUANTUMIDE_AT_MENTION_COLD_OPEN_BUDGET_MS,
			`cold @ mention P95 ${p95Ms.toFixed(2)}ms exceeds ${QUANTUMIDE_AT_MENTION_COLD_OPEN_BUDGET_MS}ms (${pathCount} paths)`,
		);
	});
});
