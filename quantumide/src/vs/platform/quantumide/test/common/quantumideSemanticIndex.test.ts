/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { buildSemanticIndex, extractAstSymbolsFromText, searchSemanticIndex } from '../../common/quantumideSemanticIndex.js';

suite('quantumideSemanticIndex', () => {
	test('buildSemanticIndex ranks relevant documents', () => {
		const index = buildSemanticIndex([
			{ path: 'a.ts', text: 'export function quantumideAgentVelocity() {}' },
			{ path: 'b.ts', text: 'export const unrelated = 1;' },
		]);
		const hits = searchSemanticIndex(index, 'quantumide agent velocity', 5);
		assert.ok(hits.length >= 1);
		assert.strictEqual(hits[0].path, 'a.ts');
	});

	test('extractAstSymbolsFromText finds declarations', () => {
		const symbols = extractAstSymbolsFromText('src/x.ts', 'export class Widget {}\nexport function run() {}\n');
		assert.ok(symbols.some(s => s.name === 'Widget' && s.kind === 'class'));
		assert.ok(symbols.some(s => s.name === 'run' && s.kind === 'function'));
	});
});
