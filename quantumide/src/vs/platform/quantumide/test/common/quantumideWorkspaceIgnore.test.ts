/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { isIgnoredByGitignore } from '../../common/quantumideGitignore.js';
import { mergeQuantumIDEIndexingExcludePatterns } from '../../common/quantumideIndexingExcludePatterns.js';
import {
	isQuantumIDEPathIgnored,
	isQuantumIDESecretFileName,
	mergeQuantumIDEIgnorePolicy,
} from '../../common/quantumideWorkspaceIgnore.js';
import { QuantumIDEWorkspaceIndexExcludeNames } from '../../common/quantumideWorkspaceGraph.js';

suite('quantumideWorkspaceIgnore', () => {
	test('blocks secret file names', () => {
		const policy = mergeQuantumIDEIgnorePolicy(QuantumIDEWorkspaceIndexExcludeNames, undefined, undefined);
		assert.ok(isQuantumIDESecretFileName('.env', policy.secretFileNames));
		assert.ok(isQuantumIDESecretFileName('server.pem', policy.secretFileNames));
	});

	test('gitignore node_modules is respected for indexing', () => {
		const policy = mergeQuantumIDEIgnorePolicy(
			QuantumIDEWorkspaceIndexExcludeNames,
			undefined,
			'node_modules/\n',
		);
		assert.ok(isQuantumIDEPathIgnored('node_modules/pkg/index.js', policy, 'index'));
		assert.ok(!isQuantumIDEPathIgnored('src/index.ts', policy, 'index'));
		assert.ok(isIgnoredByGitignore('node_modules/foo', ['node_modules/']));
	});

	test('configured excludePatterns merge dir names and globs', () => {
		const base = mergeQuantumIDEIgnorePolicy(QuantumIDEWorkspaceIndexExcludeNames, undefined, undefined);
		const policy = mergeQuantumIDEIndexingExcludePatterns(base, ['vendor', '**/generated/**']);
		assert.ok(policy.excludedDirectoryNames.has('vendor'));
		assert.ok(isQuantumIDEPathIgnored('generated/out.ts', policy, 'index'));
	});

	test('ai ignore patterns apply to ai mode', () => {
		const policy = mergeQuantumIDEIgnorePolicy(
			QuantumIDEWorkspaceIndexExcludeNames,
			'secrets/**\n*.log',
			'build-output/**',
		);
		assert.ok(isQuantumIDEPathIgnored('secrets/key.txt', policy, 'ai'));
		assert.ok(!isQuantumIDEPathIgnored('src/index.ts', policy, 'ai'));
		assert.ok(isQuantumIDEPathIgnored('build-output/bin', policy, 'index'));
		assert.ok(!isQuantumIDEPathIgnored('build-output/bin', policy, 'ai'));
	});
});
