/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { joinPath } from '../../../base/common/resources.js';
import type { URI } from '../../../base/common/uri.js';
import type { IFileService } from '../../files/common/files.js';
import { formatDependencyGraphSummary, type IQuantumIDEDependencyGraph } from './quantumideDependencyGraph.js';
import { formatDiagnosticsIndexSummary, type IQuantumIDECommentsIndex, type IQuantumIDEDiagnosticsIndex } from './quantumideIndexAugment.js';
import {
	parseAstIndexJson,
	parseSemanticIndexJson,
	searchSemanticIndex,
	type IQuantumIDEAstIndex,
	type IQuantumIDEAstSymbolEntry,
	type IQuantumIDESemanticIndex,
	QUANTUMIDE_AST_INDEX_FILE,
	QUANTUMIDE_SEMANTIC_INDEX_FILE,
} from './quantumideSemanticIndex.js';

/** Snapshot from M-29 for M-05 context sections and M-20 agent search tools. */
export interface IQuantumIDESemanticIndexFeedSnapshot {
	readonly semantic?: IQuantumIDESemanticIndex;
	readonly ast?: IQuantumIDEAstIndex;
	readonly comments?: IQuantumIDECommentsIndex;
	readonly diagnostics?: IQuantumIDEDiagnosticsIndex;
	readonly dependencyGraph?: IQuantumIDEDependencyGraph;
	readonly userQuery?: string;
}

export interface IQuantumIDEIndexContextSectionCandidate {
	readonly id: string;
	readonly title: string;
	readonly body: string;
	readonly priority: number;
}

export interface IQuantumIDEPersistedSemanticIndexes {
	readonly semantic?: IQuantumIDESemanticIndex;
	readonly ast?: IQuantumIDEAstIndex;
}

export function astSymbolsForPath(
	symbols: readonly IQuantumIDEAstSymbolEntry[],
	path: string,
	max = 5,
): readonly IQuantumIDEAstSymbolEntry[] {
	return symbols.filter(s => s.path === path).slice(0, max);
}

export function astSymbolsMatchingQuery(
	symbols: readonly IQuantumIDEAstSymbolEntry[],
	query: string,
	max = 20,
): readonly IQuantumIDEAstSymbolEntry[] {
	const terms = query.toLowerCase().split(/\W+/).filter(t => t.length > 2);
	if (terms.length === 0) {
		return symbols.slice(0, max);
	}
	const scored: { symbol: IQuantumIDEAstSymbolEntry; score: number }[] = [];
	for (const symbol of symbols) {
		const hay = `${symbol.path} ${symbol.name} ${symbol.kind}`.toLowerCase();
		let score = 0;
		for (const term of terms) {
			if (hay.includes(term)) {
				score++;
			}
		}
		if (score > 0) {
			scored.push({ symbol, score });
		}
	}
	return scored.sort((a, b) => b.score - a.score).slice(0, max).map(s => s.symbol);
}

export function formatAstSymbolLine(symbol: IQuantumIDEAstSymbolEntry): string {
	const rangeEnd = symbol.metadata?.endLine;
	const range = rangeEnd && rangeEnd !== symbol.line
		? `L${symbol.line}-${rangeEnd}`
		: `L${symbol.line}`;
	const parser = symbol.metadata?.parser ? ` [${symbol.metadata.parser}]` : '';
	return `${symbol.path}:${range} ${symbol.kind} ${symbol.name}${parser}`;
}

export function formatSemanticIndexFeedSummary(
	index: IQuantumIDESemanticIndex,
	query?: string,
	maxHits = 12,
): string {
	const header = `Semantic index (${index.generatedAt}): ${index.documents.length} documents, ${Object.keys(index.idf).length} terms`;
	if (!query?.trim()) {
		const sample = index.documents.slice(0, maxHits).map(d => `- ${d.path}`).join('\n');
		return sample ? `${header}\n${sample}` : header;
	}
	const hits = searchSemanticIndex(index, query.trim(), maxHits);
	if (hits.length === 0) {
		return `${header}\n(no query matches for "${query.trim()}")`;
	}
	const lines = hits.map(h => `- ${h.path} (score ${h.score.toFixed(2)})`);
	return `${header}\nQuery "${query.trim()}" top matches:\n${lines.join('\n')}`;
}

export function formatAstIndexFeedSummary(
	ast: IQuantumIDEAstIndex,
	query?: string,
	maxSymbols = 18,
): string {
	const ts = ast.treeSitterSymbolCount;
	const header = `AST index (${ast.generatedAt}): ${ast.symbols.length} symbols${ts ? `, ${ts} Tree-sitter` : ''}`;
	const picked = query?.trim()
		? astSymbolsMatchingQuery(ast.symbols, query.trim(), maxSymbols)
		: ast.symbols.slice(0, maxSymbols);
	if (picked.length === 0) {
		return header;
	}
	return `${header}\n${picked.map(formatAstSymbolLine).join('\n')}`;
}

/** Build M-05 context section candidates from an M-29 index snapshot. */
export function buildSemanticIndexFeedContextSections(
	snapshot: IQuantumIDESemanticIndexFeedSnapshot,
): readonly IQuantumIDEIndexContextSectionCandidate[] {
	const sections: IQuantumIDEIndexContextSectionCandidate[] = [];
	const query = snapshot.userQuery?.trim();

	if (snapshot.semantic && snapshot.semantic.documents.length > 0) {
		sections.push({
			id: 'semantic-index',
			title: `Semantic index (${snapshot.semantic.documents.length} docs)`,
			body: formatSemanticIndexFeedSummary(snapshot.semantic, query, 12),
			priority: 52,
		});
	}
	if (snapshot.ast && snapshot.ast.symbols.length > 0) {
		sections.push({
			id: 'ast-index',
			title: `AST symbol index (${snapshot.ast.symbols.length})`,
			body: formatAstIndexFeedSummary(snapshot.ast, query, 18),
			priority: 58,
		});
	}
	if (snapshot.dependencyGraph && snapshot.dependencyGraph.nodes.length > 0) {
		sections.push({
			id: 'deps',
			title: `Dependency graph (${snapshot.dependencyGraph.nodes.length} nodes)`,
			body: formatDependencyGraphSummary(snapshot.dependencyGraph, 25),
			priority: 50,
		});
	}
	if (snapshot.diagnostics && snapshot.diagnostics.entries.length > 0) {
		sections.push({
			id: 'diagnostics-index',
			title: 'Indexed diagnostics',
			body: formatDiagnosticsIndexSummary(snapshot.diagnostics, 15),
			priority: 85,
		});
	}
	if (snapshot.comments && snapshot.comments.entries.length > 0) {
		const sample = snapshot.comments.entries.slice(0, 12).map(c => `- ${c.path}:${c.line} ${c.text.slice(0, 80)}`).join('\n');
		sections.push({
			id: 'comments-index',
			title: `Indexed comments (${snapshot.comments.entries.length})`,
			body: sample,
			priority: 45,
		});
	}
	return sections;
}

export function formatSemanticSearchHitLine(
	hit: { path: string; score: number },
	astSymbols: readonly IQuantumIDEAstSymbolEntry[],
): string {
	const syms = astSymbolsForPath(astSymbols, hit.path, 5);
	if (syms.length === 0) {
		return `- ${hit.path} (score ${hit.score.toFixed(2)})`;
	}
	const symPart = syms.map(s => {
		const rangeEnd = s.metadata?.endLine;
		const at = rangeEnd && rangeEnd !== s.line ? `${s.name}@${s.line}-${rangeEnd}` : `${s.name}@${s.line}`;
		return at;
	}).join(', ');
	return `- ${hit.path} (score ${hit.score.toFixed(2)}) — symbols: ${symPart}`;
}

export async function loadQuantumIDEPersistedSemanticIndexes(
	fileService: IFileService,
	workingDirectory: URI,
	decodePayload?: (raw: string, workspaceKey: string) => Promise<string>,
): Promise<IQuantumIDEPersistedSemanticIndexes> {
	const workspaceKey = workingDirectory.fsPath;
	const readDecoded = async (relativePath: string): Promise<string | undefined> => {
		try {
			const raw = (await fileService.readFile(joinPath(workingDirectory, relativePath))).value.toString();
			return decodePayload ? await decodePayload(raw, workspaceKey) : raw;
		} catch {
			return undefined;
		}
	};
	let semantic: IQuantumIDESemanticIndex | undefined;
	let ast: IQuantumIDEAstIndex | undefined;
	const semanticRaw = await readDecoded(QUANTUMIDE_SEMANTIC_INDEX_FILE);
	if (semanticRaw) {
		semantic = parseSemanticIndexJson(semanticRaw);
	}
	const astRaw = await readDecoded(QUANTUMIDE_AST_INDEX_FILE);
	if (astRaw) {
		ast = parseAstIndexJson(astRaw);
	}
	return { semantic, ast };
}
