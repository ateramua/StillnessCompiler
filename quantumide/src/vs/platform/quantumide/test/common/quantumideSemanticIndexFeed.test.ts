/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import {
	astSymbolsMatchingQuery,
	buildSemanticIndexFeedContextSections,
	formatSemanticSearchHitLine,
} from '../../common/quantumideSemanticIndexFeed.js';
import { buildSemanticIndex, type IQuantumIDEAstSymbolEntry } from '../../common/quantumideSemanticIndex.js';
import { treeSitterSymbolEntry } from '../../common/quantumideTreeSitterAst.js';

suite('quantumideSemanticIndexFeed', () => {
	test('buildSemanticIndexFeedContextSections includes semantic and ast', () => {
		const semantic = buildSemanticIndex([
			{ path: 'a.ts', text: 'export function alpha() {}' },
			{ path: 'b.ts', text: 'class Beta {}' },
		]);
		const sym: IQuantumIDEAstSymbolEntry = treeSitterSymbolEntry('a.ts', {
			type: 'identifier',
			text: 'alpha',
			startPosition: { row: 0, column: 16 },
			endPosition: { row: 0, column: 21 },
		}, 'function_declaration');
		const sections = buildSemanticIndexFeedContextSections({
			semantic,
			ast: { version: 1, generatedAt: 't', symbols: [sym], treeSitterSymbolCount: 1 },
			userQuery: 'alpha',
		});
		const ids = sections.map(s => s.id);
		assert.ok(ids.includes('semantic-index'));
		assert.ok(ids.includes('ast-index'));
		const semanticSection = sections.find(s => s.id === 'semantic-index')!;
		assert.ok(semanticSection.body.includes('a.ts'));
	});

	test('formatSemanticSearchHitLine includes symbol line range', () => {
		const sym: IQuantumIDEAstSymbolEntry = {
			path: 'x.ts',
			line: 10,
			kind: 'function',
			name: 'run',
			metadata: { parser: 'tree-sitter-wasm', endLine: 42 },
		};
		const line = formatSemanticSearchHitLine({ path: 'x.ts', score: 1.5 }, [sym]);
		assert.ok(line.includes('run@10-42'));
	});

	test('astSymbolsMatchingQuery ranks by query terms', () => {
		const symbols: IQuantumIDEAstSymbolEntry[] = [
			{ path: 'a.ts', line: 1, kind: 'class', name: 'Foo' },
			{ path: 'b.ts', line: 2, kind: 'function', name: 'searchAlpha' },
		];
		const picked = astSymbolsMatchingQuery(symbols, 'alpha', 5);
		assert.strictEqual(picked[0]?.name, 'searchAlpha');
	});
});
