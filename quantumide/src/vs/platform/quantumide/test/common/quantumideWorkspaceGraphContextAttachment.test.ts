/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import {
	buildQuantumIDEWorkspaceGraphContextAttachment,
	computeQuantumIDEWorkspaceGraphFingerprint,
} from '../../common/quantumideWorkspaceGraphContextAttachment.js';
import { QUANTUMIDE_GRAPH_CONTEXT_COMPACT_MIN_REDUCTION } from '../../common/quantumideWorkspaceGraphContextAttachment.js';
import {
	buildQuantumIDEGraphContextAttachmentFixtureGraph,
	measureQuantumIDEGraphContextAttachmentReduction,
} from '../../common/quantumideWorkspaceGraphContextAttachmentPerformance.js';

suite('quantumideWorkspaceGraphContextAttachment', () => {
	test('RR-03: unchanged generation uses compact attach mode', () => {
		const graph = buildQuantumIDEGraphContextAttachmentFixtureGraph(40);
		const generation = 2;
		const fingerprint = computeQuantumIDEWorkspaceGraphFingerprint(graph);
		const full = buildQuantumIDEWorkspaceGraphContextAttachment({
			graph,
			generation,
			indexingEnabled: false,
			splitRoots: false,
			maxChars: 14_000,
			maxFiles: 20,
		});
		const compact = buildQuantumIDEWorkspaceGraphContextAttachment({
			graph,
			generation,
			lastAttached: { generation, fingerprint, mode: 'full' },
			indexingEnabled: false,
			splitRoots: false,
			maxChars: 14_000,
			maxFiles: 20,
		});
		assert.strictEqual(full.mode, 'full');
		assert.strictEqual(compact.mode, 'compact');
		assert.ok(compact.primary.includes('unchanged'));
		assert.ok(compact.primary.length < full.primary.length);
	});

	test('generation bump uses full attach again', () => {
		const graph = buildQuantumIDEGraphContextAttachmentFixtureGraph(10);
		const fp = computeQuantumIDEWorkspaceGraphFingerprint(graph);
		const compact = buildQuantumIDEWorkspaceGraphContextAttachment({
			graph,
			generation: 2,
			lastAttached: { generation: 1, fingerprint: fp, mode: 'compact' },
			indexingEnabled: false,
			splitRoots: false,
			maxChars: 14_000,
			maxFiles: 20,
		});
		assert.strictEqual(compact.mode, 'full');
	});

	test('AC-03-05: compact attachment ≥50% smaller than full baseline', () => {
		const result = measureQuantumIDEGraphContextAttachmentReduction();
		assert.ok(result.meetsAc0305, `reduction ${(result.reductionRatio * 100).toFixed(1)}% < ${QUANTUMIDE_GRAPH_CONTEXT_COMPACT_MIN_REDUCTION * 100}%`);
		assert.ok(result.compactBytes < result.fullBytes);
	});
});
