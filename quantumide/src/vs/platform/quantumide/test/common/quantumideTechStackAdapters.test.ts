/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import {
	QuantumIDELineHunkDiffAdapter,
	QuantumIDERegexParserAdapter,
	getDefaultQuantumIDEParserAdapter,
} from '../../common/quantumideTechStackAdapters.js';

suite('QuantumIDE tech stack adapters', () => {
	test('default parser extracts symbols', () => {
		const parser = getDefaultQuantumIDEParserAdapter();
		assert.ok(parser instanceof QuantumIDERegexParserAdapter);
		const symbols = parser.extractSymbols('a.ts', 'export function hello() {}');
		assert.ok(symbols.some(s => s.name === 'hello'));
	});

	test('diff adapter produces hunks for changed lines', () => {
		const diff = new QuantumIDELineHunkDiffAdapter();
		const hunks = diff.computeHunks('a\nb\n', 'a\nc\n');
		assert.ok(hunks.length >= 1);
	});
});
