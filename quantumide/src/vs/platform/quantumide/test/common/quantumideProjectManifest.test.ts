/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { QuantumIDEManifestKind } from '../../common/quantumideWorkspaceGraph.js';
import { parseProjectManifestSummary } from '../../common/quantumideProjectManifest.js';

suite('quantumideProjectManifest', () => {
	test('parses package.json summary', () => {
		const summary = parseProjectManifestSummary(
			QuantumIDEManifestKind.PackageJson,
			'package.json',
			JSON.stringify({ name: 'demo', version: '1.0.0', scripts: { test: 'jest' } }),
		);
		assert.strictEqual(summary.name, 'demo');
		assert.ok(summary.scripts?.includes('test'));
	});
});
