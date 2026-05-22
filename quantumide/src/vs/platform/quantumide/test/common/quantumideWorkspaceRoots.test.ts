/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import {
	collectAgentSearchRoots,
	formatWorkspaceFolderLinks,
	resolvePathAcrossWorkspaceRoots,
	resolveQuantumIDEWorkspaceVariablePath,
	workspaceLinksToJson,
} from '../../common/quantumideWorkspaceRoots.js';

suite('quantumideWorkspaceRoots', () => {
	test('formatWorkspaceFolderLinks maps VS Code folders', () => {
		const links = formatWorkspaceFolderLinks([
			{ name: 'StillnessCompiler', uri: URI.file('/repos/StillnessCompiler') },
			{ name: 'InnerProsperity', uri: URI.file('/repos/InnerProsperity') },
		]);
		assert.strictEqual(links.length, 2);
		assert.strictEqual(links[0].name, 'StillnessCompiler');
		assert.strictEqual(links[1].path, '/repos/InnerProsperity');
	});

	test('resolvePathAcrossWorkspaceRoots uses folder prefix', () => {
		const wd = URI.file('/repos/StillnessCompiler');
		const links = formatWorkspaceFolderLinks([
			{ name: 'StillnessCompiler', uri: wd },
			{ name: 'InnerProsperity', uri: URI.file('/repos/InnerProsperity') },
		]);
		const resolved = resolvePathAcrossWorkspaceRoots(wd, links, 'InnerProsperity/README.md');
		assert.strictEqual(resolved.fsPath, '/repos/InnerProsperity/README.md');
	});

	test('resolveQuantumIDEWorkspaceVariablePath resolves multi-root paths', () => {
		const folders = [
			{ name: 'StillnessCompiler', uri: URI.file('/repos/StillnessCompiler') },
			{ name: 'InnerProsperity', uri: URI.file('/repos/InnerProsperity') },
		];
		const resolved = resolveQuantumIDEWorkspaceVariablePath('InnerProsperity/src/app.ts', folders);
		assert.strictEqual(resolved?.fsPath, '/repos/InnerProsperity/src/app.ts');
	});

	test('collectAgentSearchRoots dedupes primary and links', () => {
		const wd = URI.file('/repos/a');
		const links = [{ name: 'a', path: '/repos/a' }, { name: 'b', path: '/repos/b' }];
		const roots = collectAgentSearchRoots(wd, links);
		assert.strictEqual(roots.length, 2);
		assert.ok(workspaceLinksToJson(links).includes('"version": 1'));
	});
});
