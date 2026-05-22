/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import {
	computeQuantumIDELiteGraphEffectiveMaxFiles,
	computeQuantumIDELiteGraphPerRootBudget,
	hasQuantumIDETopLevelEntryForRoot,
	QUANTUMIDE_LITE_GRAPH_MULTI_ROOT_SCHEDULE_MS,
	validateQuantumIDELiteGraphListsAllRoots,
} from '../../common/quantumideLiteGraphValidation.js';
import { QuantumIDEManifestKind, type IQuantumIDEWorkspaceGraph } from '../../common/quantumideWorkspaceGraph.js';

suite('quantumideLiteGraphValidation', () => {
	test('5-root budget allows per-root top-level slice', () => {
		assert.strictEqual(computeQuantumIDELiteGraphPerRootBudget(5), 24);
		assert.strictEqual(computeQuantumIDELiteGraphEffectiveMaxFiles(5), 120);
		assert.ok(QUANTUMIDE_LITE_GRAPH_MULTI_ROOT_SCHEDULE_MS <= 10_000);
	});

	test('validate accepts graph with all roots and top-level entries', () => {
		const graph: IQuantumIDEWorkspaceGraph = {
			version: 1,
			workspaceId: 'ws',
			folders: [
				{ name: 'A', uri: 'file:///a' },
				{ name: 'B', uri: 'file:///b' },
				{ name: 'C', uri: 'file:///c' },
				{ name: 'D', uri: 'file:///d' },
				{ name: 'E', uri: 'file:///e' },
			],
			projects: [],
			manifests: [{ kind: QuantumIDEManifestKind.PackageJson, name: 'package.json', uri: 'file:///a/package.json', workspaceRelativePath: 'A/package.json', projectPath: 'A' }],
			files: [
				{ uri: 'file:///a/x.ts', workspaceRelativePath: 'A/x.ts', name: 'x.ts', extension: '.ts' },
				{ uri: 'file:///b/y.ts', workspaceRelativePath: 'B/y.ts', name: 'y.ts', extension: '.ts' },
				{ uri: 'file:///c/z.ts', workspaceRelativePath: 'C/z.ts', name: 'z.ts', extension: '.ts' },
				{ uri: 'file:///d/w.ts', workspaceRelativePath: 'D/w.ts', name: 'w.ts', extension: '.ts' },
				{ uri: 'file:///e/v.ts', workspaceRelativePath: 'E/v.ts', name: 'v.ts', extension: '.ts' },
			],
			status: {
				indexed: true,
				perRoot: [
					{ folderName: 'A', filesIndexed: 2, truncated: false },
					{ folderName: 'B', filesIndexed: 1, truncated: false },
					{ folderName: 'C', filesIndexed: 1, truncated: false },
					{ folderName: 'D', filesIndexed: 1, truncated: false },
					{ folderName: 'E', filesIndexed: 1, truncated: false },
				],
			},
		};
		assert.ok(hasQuantumIDETopLevelEntryForRoot(graph, 'A'));
		assert.deepStrictEqual(validateQuantumIDELiteGraphListsAllRoots(graph), []);
	});

	test('validate rejects missing perRoot row', () => {
		const graph: IQuantumIDEWorkspaceGraph = {
			version: 1,
			workspaceId: 'ws',
			folders: [{ name: 'Only', uri: 'file:///only' }],
			projects: [],
			manifests: [],
			files: [{ uri: 'file:///only/a.ts', workspaceRelativePath: 'Only/a.ts', name: 'a.ts' }],
			status: { indexed: true, perRoot: [] },
		};
		assert.ok(validateQuantumIDELiteGraphListsAllRoots(graph).length > 0);
	});
});
