/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { QuantumIDEManifestKind, detectQuantumIDEManifestKind, getQuantumIDEManifestEcosystem, summarizeQuantumIDEWorkspaceGraph, type IQuantumIDEWorkspaceGraph } from '../../common/quantumideWorkspaceGraph.js';

suite('QuantumIDE workspace graph', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('detects supported manifest kinds', () => {
		assert.strictEqual(detectQuantumIDEManifestKind('package.json'), QuantumIDEManifestKind.PackageJson);
		assert.strictEqual(detectQuantumIDEManifestKind('requirements.txt'), QuantumIDEManifestKind.RequirementsTxt);
		assert.strictEqual(detectQuantumIDEManifestKind('.git'), QuantumIDEManifestKind.Git);
		assert.strictEqual(detectQuantumIDEManifestKind('tsconfig.json'), QuantumIDEManifestKind.TsConfig);
		assert.strictEqual(detectQuantumIDEManifestKind('Cargo.toml'), QuantumIDEManifestKind.CargoToml);
		assert.strictEqual(detectQuantumIDEManifestKind('pom.xml'), QuantumIDEManifestKind.PomXml);
		assert.strictEqual(detectQuantumIDEManifestKind('go.mod'), QuantumIDEManifestKind.GoMod);
		assert.strictEqual(detectQuantumIDEManifestKind('composer.json'), QuantumIDEManifestKind.ComposerJson);
		assert.strictEqual(detectQuantumIDEManifestKind('pyproject.toml'), QuantumIDEManifestKind.PyprojectToml);
		assert.strictEqual(detectQuantumIDEManifestKind('README.md'), undefined);
	});

	test('maps manifests to ecosystems', () => {
		assert.strictEqual(getQuantumIDEManifestEcosystem(QuantumIDEManifestKind.PackageJson), 'node/typescript');
		assert.strictEqual(getQuantumIDEManifestEcosystem(QuantumIDEManifestKind.PyprojectToml), 'python');
		assert.strictEqual(getQuantumIDEManifestEcosystem(QuantumIDEManifestKind.CargoToml), 'rust');
		assert.strictEqual(getQuantumIDEManifestEcosystem(QuantumIDEManifestKind.GoMod), 'go');
	});

	test('summarizes graph counts compactly', () => {
		const graph: IQuantumIDEWorkspaceGraph = {
			version: 1,
			workspaceId: 'test',
			folders: [{ name: 'repo', uri: 'file:///repo' }],
			projects: [{
				id: 'file:///repo',
				name: 'repo',
				rootUri: 'file:///repo',
				workspaceRelativePath: 'repo',
				ecosystem: 'node/typescript',
				manifestKinds: [QuantumIDEManifestKind.PackageJson],
				frameworks: ['node'],
			}],
			manifests: [{
				kind: QuantumIDEManifestKind.PackageJson,
				name: 'package.json',
				uri: 'file:///repo/package.json',
				workspaceRelativePath: 'repo/package.json',
				projectPath: 'repo',
			}],
			files: [{
				uri: 'file:///repo/src/index.ts',
				workspaceRelativePath: 'repo/src/index.ts',
				name: 'index.ts',
				extension: '.ts',
			}],
			status: { indexed: true, generatedAt: '2026-05-18T00:00:00.000Z' },
		};

		assert.strictEqual(summarizeQuantumIDEWorkspaceGraph(graph), 'projects=1, manifests=package.json: 1, files=1');
	});
});
