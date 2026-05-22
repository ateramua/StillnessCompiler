/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { assertSafeWorkspaceRelativePath, isUriUnderWorkspaceRoots } from '../../common/quantumideWorkspacePathSecurity.js';
import { formatWorkspaceFolderLinks, resolvePathAcrossWorkspaceRoots } from '../../common/quantumideWorkspaceRoots.js';

suite('quantumideWorkspacePathSecurity', () => {
	test('rejects parent traversal in relative paths', () => {
		assert.throws(() => assertSafeWorkspaceRelativePath('../etc/passwd'));
	});

	test('resolvePath stays under workspace roots', () => {
		const wd = URI.file('/repos/a');
		const links = formatWorkspaceFolderLinks([
			{ name: 'a', uri: wd },
			{ name: 'b', uri: URI.file('/repos/b') },
		]);
		const resolved = resolvePathAcrossWorkspaceRoots(wd, links, 'b/src/foo.ts');
		assert.strictEqual(resolved.fsPath, '/repos/b/src/foo.ts');
		assert.ok(isUriUnderWorkspaceRoots(resolved, [wd, URI.file('/repos/b')]));
	});

	test('absolute path outside roots throws', () => {
		const wd = URI.file('/repos/a');
		const links = formatWorkspaceFolderLinks([{ name: 'a', uri: wd }]);
		assert.throws(() => resolvePathAcrossWorkspaceRoots(wd, links, '/etc/passwd'));
	});
});
