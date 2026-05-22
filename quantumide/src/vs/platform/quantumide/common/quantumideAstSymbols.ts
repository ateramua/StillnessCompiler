/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/** Which parser produced the symbol row (M-29). */
export type QuantumIDEAstParserSource = 'tree-sitter-wasm' | 'regex-ast';

/** Optional Tree-sitter / structural metadata preserved in the AST index. */
export interface IQuantumIDEAstSymbolMetadata {
	readonly parser: QuantumIDEAstParserSource;
	readonly nodeType?: string;
	readonly parentType?: string;
	readonly endLine?: number;
	readonly startColumn?: number;
	readonly endColumn?: number;
}

export interface IQuantumIDEAstSymbolEntry {
	readonly path: string;
	readonly line: number;
	readonly kind: string;
	readonly name: string;
	readonly metadata?: IQuantumIDEAstSymbolMetadata;
}

const AST_PATTERNS: { kind: string; pattern: RegExp }[] = [
	{ kind: 'function', pattern: /^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)/ },
	{ kind: 'class', pattern: /^\s*(?:export\s+)?class\s+(\w+)/ },
	{ kind: 'interface', pattern: /^\s*(?:export\s+)?interface\s+(\w+)/ },
	{ kind: 'type', pattern: /^\s*(?:export\s+)?type\s+(\w+)/ },
	{ kind: 'method', pattern: /^\s*(?:public|private|protected)?\s*(?:async\s+)?(\w+)\s*\([^)]*\)\s*[:{]/ },
];

/** Regex-based AST symbol extraction (default parser; Tree-sitter slot in tech stack adapters). */
export function extractAstSymbolsFromText(path: string, text: string, maxPerFile = 80): IQuantumIDEAstSymbolEntry[] {
	const symbols: IQuantumIDEAstSymbolEntry[] = [];
	const lines = text.split(/\r?\n/);
	for (let i = 0; i < lines.length && symbols.length < maxPerFile; i++) {
		const line = lines[i];
		for (const { kind, pattern } of AST_PATTERNS) {
			const match = line.match(pattern);
			if (match?.[1]) {
				symbols.push({
					path,
					line: i + 1,
					kind,
					name: match[1],
					metadata: { parser: 'regex-ast' },
				});
				break;
			}
		}
	}
	return symbols;
}
