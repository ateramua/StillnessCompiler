/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import type { IQuantumIDEAstSymbolEntry } from './quantumideAstSymbols.js';

export interface IQuantumIDETypeHierarchyNode {
	readonly name: string;
	readonly path: string;
	readonly line: number;
	readonly kind: string;
	readonly children: readonly IQuantumIDETypeHierarchyNode[];
}

/** Build a shallow type hierarchy from indexed symbols (§2.3 type hierarchy lookup). */
export function buildTypeHierarchy(symbols: readonly IQuantumIDEAstSymbolEntry[], typeName: string, maxDepth = 4): IQuantumIDETypeHierarchyNode | undefined {
	const needle = typeName.trim().toLowerCase();
	if (!needle) {
		return undefined;
	}
	const matches = symbols.filter(s => s.name.toLowerCase() === needle || s.name.toLowerCase().includes(needle));
	if (matches.length === 0) {
		return undefined;
	}
	const root = matches[0];
	const children = symbols
		.filter(s => s.path === root.path && s.line > root.line && (s.kind === 'method' || s.kind === 'property'))
		.slice(0, 40)
		.map(s => ({ name: s.name, path: s.path, line: s.line, kind: s.kind, children: [] }));
	return { name: root.name, path: root.path, line: root.line, kind: root.kind, children: children.slice(0, maxDepth) };
}

export function formatTypeHierarchy(node: IQuantumIDETypeHierarchyNode, indent = 0): string {
	const pad = '  '.repeat(indent);
	const lines = [`${pad}${node.kind} ${node.name} (${node.path}:${node.line})`];
	for (const child of node.children) {
		lines.push(formatTypeHierarchy(child, indent + 1));
	}
	return lines.join('\n');
}
