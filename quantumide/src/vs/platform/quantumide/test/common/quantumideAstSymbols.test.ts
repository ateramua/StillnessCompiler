/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { extractAstSymbolsFromText } from '../../common/quantumideAstSymbols.js';
import { buildAstIndex, countTreeSitterAstSymbols } from '../../common/quantumideSemanticIndex.js';
import {
	symbolKindFromTreeSitterParent,
	treeSitterAstMetadata,
	treeSitterSymbolEntry,
} from '../../common/quantumideTreeSitterAst.js';

suite('quantumideAstSymbols (M-29 metadata)', () => {
	test('regex fallback tags parser source', () => {
		const symbols = extractAstSymbolsFromText('src/a.ts', 'export function run() {}\n');
		assert.strictEqual(symbols[0].metadata?.parser, 'regex-ast');
	});

	test('tree-sitter symbols preserve node span metadata', () => {
		const entry = treeSitterSymbolEntry('pkg/foo.ts', {
			type: 'identifier',
			text: 'Widget',
			startPosition: { row: 4, column: 15 },
			endPosition: { row: 4, column: 21 },
		}, 'class_declaration');
		assert.strictEqual(entry.metadata?.parser, 'tree-sitter-wasm');
		assert.strictEqual(entry.metadata?.nodeType, 'identifier');
		assert.strictEqual(entry.metadata?.parentType, 'class_declaration');
		assert.strictEqual(entry.line, 5);
		assert.strictEqual(entry.metadata?.endLine, 5);
		assert.strictEqual(entry.metadata?.startColumn, 15);
		assert.strictEqual(entry.kind, 'class');
	});

	test('symbolKindFromTreeSitterParent maps declaration types', () => {
		assert.strictEqual(symbolKindFromTreeSitterParent('interface_declaration'), 'interface');
		assert.strictEqual(symbolKindFromTreeSitterParent('method_definition'), 'method');
	});

	test('buildAstIndex records treeSitterSymbolCount', () => {
		const index = buildAstIndex([], () => [{
			path: 'a.ts',
			line: 1,
			kind: 'class',
			name: 'A',
			metadata: treeSitterAstMetadata({
				type: 'type_identifier',
				text: 'A',
				startPosition: { row: 0, column: 0 },
				endPosition: { row: 0, column: 1 },
			}, 'class_declaration'),
		}]);
		assert.strictEqual(countTreeSitterAstSymbols(index.symbols), 1);
		assert.strictEqual(index.treeSitterSymbolCount, 1);
	});
});
