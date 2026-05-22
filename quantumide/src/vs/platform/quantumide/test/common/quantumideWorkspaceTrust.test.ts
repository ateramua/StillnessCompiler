/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { createEmptyQuantumIDEWorkspaceGraph } from '../../common/quantumideWorkspaceGraph.js';
import {
	formatQuantumIDEWorkspaceTrustWarningForContext,
	isQuantumIDEWorkspaceGraphUntrusted,
	QUANTUMIDE_WORKSPACE_UNTRUSTED_REASON,
	validateQuantumIDEUntrustedWorkspaceGraph,
} from '../../common/quantumideWorkspaceTrust.js';
import { formatRankedContext, rankAndTrimContextSections } from '../../common/quantumideContextRanker.js';

suite('quantumideWorkspaceTrust', () => {
	test('untrusted graph has empty files and warning reason', () => {
		const graph = createEmptyQuantumIDEWorkspaceGraph('ws', [{ name: 'Root', uri: 'file:///r' }], QUANTUMIDE_WORKSPACE_UNTRUSTED_REASON);
		assert.ok(isQuantumIDEWorkspaceGraphUntrusted(graph));
		assert.deepStrictEqual(validateQuantumIDEUntrustedWorkspaceGraph(graph), []);
	});

	test('trust warning is included in ranked chat context', () => {
		const warning = formatQuantumIDEWorkspaceTrustWarningForContext();
		assert.ok(warning.includes('not trusted'));
		const { included } = rankAndTrimContextSections([
			{ id: 'workspace-trust-warning', title: 'Workspace trust', body: warning, priority: 102 },
			{ id: 'workspace', title: '', body: 'Workspace folders only.', priority: 100 },
		], 12_000);
		const body = formatRankedContext(included);
		assert.ok(body.includes('Security — workspace not trusted'));
		assert.ok(body.includes('did not run a full workspace file scan'));
	});
});
