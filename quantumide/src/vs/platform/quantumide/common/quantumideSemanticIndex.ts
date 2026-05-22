/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { extractAstSymbolsFromText, type IQuantumIDEAstSymbolEntry } from './quantumideAstSymbols.js';
import { buildTermFrequency, tokenizeForSemanticIndex } from './quantumideSemanticTokenize.js';

export type { IQuantumIDEAstSymbolEntry } from './quantumideAstSymbols.js';
export { extractAstSymbolsFromText } from './quantumideAstSymbols.js';
export { buildTermFrequency, tokenizeForSemanticIndex } from './quantumideSemanticTokenize.js';

export const QUANTUMIDE_SEMANTIC_INDEX_FILE = '.quantumide/semantic-index.json';
export const QUANTUMIDE_VECTOR_INDEX_FILE = '.quantumide/vector-index.json';
export const QUANTUMIDE_AST_INDEX_FILE = '.quantumide/ast-index.json';
export const QUANTUMIDE_DEPENDENCY_GRAPH_FILE = '.quantumide/dependency-graph.json';
export const QUANTUMIDE_SYMBOL_INDEX_FILE = '.quantumide/symbol-index.json';
export const QUANTUMIDE_WORKSPACE_POLICIES_FILE = '.quantumide/policies.json';

export interface IQuantumIDESemanticDocument {
	readonly path: string;
	readonly terms: Record<string, number>;
}

export interface IQuantumIDESemanticIndex {
	readonly version: 1;
	readonly generatedAt: string;
	readonly idf: Record<string, number>;
	readonly documents: readonly IQuantumIDESemanticDocument[];
}

export interface IQuantumIDEAstIndex {
	readonly version: 1;
	readonly generatedAt: string;
	readonly symbols: readonly IQuantumIDEAstSymbolEntry[];
	/** Count of symbols with Tree-sitter metadata when index was built. */
	readonly treeSitterSymbolCount?: number;
}

export function buildSemanticIndex(documents: { path: string; text: string }[]): IQuantumIDESemanticIndex {
	const docFreq: Record<string, number> = {};
	const builtDocs: IQuantumIDESemanticDocument[] = [];
	for (const doc of documents) {
		const terms = buildTermFrequency(tokenizeForSemanticIndex(doc.text));
		builtDocs.push({ path: doc.path, terms });
		for (const term of Object.keys(terms)) {
			docFreq[term] = (docFreq[term] ?? 0) + 1;
		}
	}
	const n = Math.max(1, builtDocs.length);
	const idf: Record<string, number> = {};
	for (const [term, df] of Object.entries(docFreq)) {
		idf[term] = Math.log((n + 1) / (df + 1)) + 1;
	}
	return {
		version: 1,
		generatedAt: new Date().toISOString(),
		idf,
		documents: builtDocs,
	};
}

export function searchSemanticIndex(index: IQuantumIDESemanticIndex, query: string, maxResults = 20): { path: string; score: number }[] {
	const queryTerms = buildTermFrequency(tokenizeForSemanticIndex(query));
	const scores: { path: string; score: number }[] = [];
	for (const doc of index.documents) {
		let score = 0;
		for (const [term, qtf] of Object.entries(queryTerms)) {
			const dtf = doc.terms[term];
			if (!dtf) {
				continue;
			}
			const weight = (idfWeight(index, term) ?? 0) * dtf * qtf;
			score += weight;
		}
		if (score > 0) {
			scores.push({ path: doc.path, score });
		}
	}
	return scores.sort((a, b) => b.score - a.score).slice(0, maxResults);
}

function idfWeight(index: IQuantumIDESemanticIndex, term: string): number | undefined {
	return index.idf[term];
}

export function parseSemanticIndexJson(raw: string): IQuantumIDESemanticIndex | undefined {
	try {
		const parsed = JSON.parse(raw) as IQuantumIDESemanticIndex;
		if (parsed?.version === 1 && Array.isArray(parsed.documents) && parsed.idf) {
			return parsed;
		}
	} catch {
		// ignore
	}
	return undefined;
}

export function parseAstIndexJson(raw: string): IQuantumIDEAstIndex | undefined {
	try {
		const parsed = JSON.parse(raw) as IQuantumIDEAstIndex;
		if (parsed?.version === 1 && Array.isArray(parsed.symbols)) {
			return parsed;
		}
	} catch {
		// ignore
	}
	return undefined;
}

export type QuantumIDEAstSymbolExtractor = (path: string, text: string, maxPerFile?: number) => readonly IQuantumIDEAstSymbolEntry[];

export function countTreeSitterAstSymbols(symbols: readonly IQuantumIDEAstSymbolEntry[]): number {
	return symbols.filter(s => s.metadata?.parser === 'tree-sitter-wasm').length;
}

export function buildAstIndex(
	files: { path: string; text: string }[],
	extractSymbols: QuantumIDEAstSymbolExtractor = extractAstSymbolsFromText,
): IQuantumIDEAstIndex {
	const symbols: IQuantumIDEAstSymbolEntry[] = [];
	for (const file of files) {
		symbols.push(...extractSymbols(file.path, file.text));
	}
	const treeSitterSymbolCount = countTreeSitterAstSymbols(symbols);
	return {
		version: 1,
		generatedAt: new Date().toISOString(),
		symbols,
		treeSitterSymbolCount: treeSitterSymbolCount > 0 ? treeSitterSymbolCount : undefined,
	};
}
