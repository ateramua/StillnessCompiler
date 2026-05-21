/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { discoverTestsFromWorkspaceFiles } from '../../common/quantumideTestDiscovery.js';

suite('quantumideTestDiscovery', () => {
	test('discovers npm test script and test files', () => {
		const result = discoverTestsFromWorkspaceFiles(
			['src/foo.test.ts', 'src/bar.spec.tsx'],
			{ test: 'jest', lint: 'eslint .' },
		);
		assert.ok(result.tests.some(t => t.id === 'npm-test'));
		assert.ok(result.tests.some(t => t.path === 'src/foo.test.ts'));
	});
});
