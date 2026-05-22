/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { QuantumIDEContextInspectorService } from '../../browser/quantumideContextInspectorService.js';

suite('QuantumIDEContextInspectorService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('recordBuild exposes omitted section ids', () => {
		const inspector = disposables.add(new QuantumIDEContextInspectorService());
		inspector.recordBuild([
			{ id: 'workspace', title: 'Workspace', charCount: 100, omitted: false },
			{ id: 'comments-index', title: 'Comments', charCount: 50, omitted: true },
			{ id: 'navigation', title: 'Navigation', charCount: 30, omitted: true },
		]);
		assert.deepStrictEqual(inspector.getOmittedSectionIds(), ['comments-index', 'navigation']);
	});

	test('markContextStale flags sections and isContextStale', () => {
		const inspector = disposables.add(new QuantumIDEContextInspectorService());
		inspector.recordBuild([
			{ id: 'workspace', title: 'Workspace', charCount: 10, omitted: false },
		]);
		inspector.markContextStale();
		assert.strictEqual(inspector.isContextStale(), true);
		assert.strictEqual(inspector.getSections()[0]?.stale, true);
	});
});
