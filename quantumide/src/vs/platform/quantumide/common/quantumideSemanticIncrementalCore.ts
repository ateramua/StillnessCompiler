/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { buildCommentsIndex } from './quantumideIndexAugment.js';
import {
	buildSemanticIndex,
	countTreeSitterAstSymbols,
	type IQuantumIDEAstIndex,
	type IQuantumIDEAstSymbolEntry,
	type IQuantumIDESemanticIndex,
} from './quantumideSemanticIndex.js';
import { getDefaultQuantumIDEParserAdapter } from './quantumideTechStackAdapters.js';

export interface IQuantumIDESemanticIncrementalCoreInput {
	readonly relativePath: string;
	readonly text: string;
	readonly semanticIndex?: IQuantumIDESemanticIndex;
	readonly astIndex?: IQuantumIDEAstIndex;
}

export interface IQuantumIDESemanticIncrementalCoreResult {
	readonly semanticIndex?: IQuantumIDESemanticIndex;
	readonly astIndex?: IQuantumIDEAstIndex;
	readonly commentsEntryCount: number;
	readonly symbolCount: number;
}

/**
 * CPU-only incremental semantic/AST update for one file (no IFileService). AC-01-04 / M-29.
 */
export function applyQuantumIDESemanticIncrementalCore(
	input: IQuantumIDESemanticIncrementalCoreInput,
): IQuantumIDESemanticIncrementalCoreResult {
	const { relativePath, text } = input;
	let semanticIndex = input.semanticIndex;
	let astIndex = input.astIndex;

	if (semanticIndex) {
		const terms = buildSemanticIndex([{ path: relativePath, text }]).documents[0]?.terms ?? {};
		const docIndex = semanticIndex.documents.findIndex(d => d.path === relativePath);
		const docs = [...semanticIndex.documents];
		if (docIndex >= 0) {
			docs[docIndex] = { path: relativePath, terms };
		} else {
			docs.push({ path: relativePath, terms });
		}
		semanticIndex = { ...semanticIndex, documents: docs };
	}

	const parser = getDefaultQuantumIDEParserAdapter();
	const symbols = parser.extractSymbols(relativePath, text, 200);
	let symbolCount = 0;
	if (astIndex && symbols.length > 0) {
		const filtered = astIndex.symbols.filter(s => s.path !== relativePath);
		const merged: IQuantumIDEAstSymbolEntry[] = [...filtered, ...symbols];
		symbolCount = merged.length;
		const treeSitterSymbolCount = countTreeSitterAstSymbols(merged);
		astIndex = {
			...astIndex,
			symbols: merged,
			treeSitterSymbolCount: treeSitterSymbolCount > 0 ? treeSitterSymbolCount : undefined,
		};
	}

	const commentSlice = buildCommentsIndex([{ path: relativePath, text }]);
	return {
		semanticIndex,
		astIndex,
		commentsEntryCount: commentSlice.entries.length,
		symbolCount,
	};
}
