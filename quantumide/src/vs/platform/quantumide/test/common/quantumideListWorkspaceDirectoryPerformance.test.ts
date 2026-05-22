/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import {
	formatListWorkspaceDirectoryIndexResponse,
	listWorkspaceDirectoryFromStructureIndex,
} from '../../common/quantumideListWorkspaceDirectoryIndex.js';
import {
	buildQuantumIDEListWorkspaceDirectoryIndexFixture,
	measureQuantumIDEListWorkspaceDirectoryIndexP95Ms,
	QUANTUMIDE_LIST_WORKSPACE_DIRECTORY_P95_BUDGET_MS,
} from '../../common/quantumideListWorkspaceDirectoryPerformance.js';
import { mergeQuantumIDEIgnorePolicy } from '../../common/quantumideWorkspaceIgnore.js';

suite('quantumideListWorkspaceDirectoryPerformance', () => {
	test('indexed list formats directory entries', () => {
		const index = buildQuantumIDEListWorkspaceDirectoryIndexFixture();
		const policy = mergeQuantumIDEIgnorePolicy(new Set(), undefined, undefined);
		const listed = listWorkspaceDirectoryFromStructureIndex(index, 'src/pkg0', 80, policy);
		assert.ok(listed.lines.some(l => l.includes('[file]') && l.includes('module')));
		const body = formatListWorkspaceDirectoryIndexResponse('src/pkg0', listed);
		assert.ok(body.includes('workspace index'));
	});

	test('AC-02-02: list_workspace_directory on indexed dir P95 within budget', () => {
		const p95 = measureQuantumIDEListWorkspaceDirectoryIndexP95Ms();
		assert.ok(
			p95 < QUANTUMIDE_LIST_WORKSPACE_DIRECTORY_P95_BUDGET_MS,
			`expected list_workspace_directory P95 < ${QUANTUMIDE_LIST_WORKSPACE_DIRECTORY_P95_BUDGET_MS}ms, got ${p95.toFixed(3)}ms`,
		);
	});
});
