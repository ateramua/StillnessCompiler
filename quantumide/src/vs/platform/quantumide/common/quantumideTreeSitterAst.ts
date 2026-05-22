/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import type { IQuantumIDEAstSymbolEntry, IQuantumIDEAstSymbolMetadata } from './quantumideAstSymbols.js';

/** Minimal node shape from Tree-sitter captures (for tests without WASM). */
export interface IQuantumIDETreeSitterNodeShape {
	readonly type: string;
	readonly text: string;
	readonly startPosition: { readonly row: number; readonly column: number };
	readonly endPosition: { readonly row: number; readonly column: number };
}

export function symbolKindFromTreeSitterParent(parentType: string): string {
	if (parentType.includes('class')) {
		return 'class';
	}
	if (parentType.includes('interface')) {
		return 'interface';
	}
	if (parentType.includes('method')) {
		return 'method';
	}
	return 'function';
}

export function treeSitterAstMetadata(node: IQuantumIDETreeSitterNodeShape, parentType: string): IQuantumIDEAstSymbolMetadata {
	return {
		parser: 'tree-sitter-wasm',
		nodeType: node.type,
		parentType: parentType || undefined,
		endLine: node.endPosition.row + 1,
		startColumn: node.startPosition.column,
		endColumn: node.endPosition.column,
	};
}

export function treeSitterSymbolEntry(path: string, nameNode: IQuantumIDETreeSitterNodeShape, parentType: string): IQuantumIDEAstSymbolEntry {
	return {
		path,
		line: nameNode.startPosition.row + 1,
		kind: symbolKindFromTreeSitterParent(parentType),
		name: nameNode.text,
		metadata: treeSitterAstMetadata(nameNode, parentType),
	};
}
