/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

export const QUANTUMIDE_COMMENTS_INDEX_FILE = '.quantumide/comments-index.json';
export const QUANTUMIDE_DIAGNOSTICS_INDEX_FILE = '.quantumide/diagnostics-index.json';

export interface IQuantumIDECommentIndexEntry {
	readonly path: string;
	readonly line: number;
	readonly text: string;
	readonly kind: 'line' | 'block';
}

export interface IQuantumIDECommentsIndex {
	readonly version: 1;
	readonly generatedAt: string;
	readonly entries: readonly IQuantumIDECommentIndexEntry[];
}

export interface IQuantumIDEDiagnosticIndexEntry {
	readonly path: string;
	readonly line: number;
	readonly message: string;
	readonly severity: 'error' | 'warning' | 'info' | 'hint';
	readonly source?: string;
	readonly code?: string;
}

export interface IQuantumIDEDiagnosticsIndex {
	readonly version: 1;
	readonly generatedAt: string;
	readonly entries: readonly IQuantumIDEDiagnosticIndexEntry[];
}

const LINE_COMMENT = /^\s*(\/\/|#|--)\s*(.+)$/;
const BLOCK_COMMENT_START = /\/\*/;

/** Extract line and block comments for indexing (§2.3). */
export function extractCommentsFromText(path: string, text: string, maxPerFile = 120): IQuantumIDECommentIndexEntry[] {
	const entries: IQuantumIDECommentIndexEntry[] = [];
	const lines = text.split(/\r?\n/);
	let inBlock = false;
	let blockStart = 0;
	let blockLines: string[] = [];

	for (let i = 0; i < lines.length && entries.length < maxPerFile; i++) {
		const line = lines[i];
		if (inBlock) {
			blockLines.push(line);
			if (line.includes('*/')) {
				inBlock = false;
				const text = blockLines.join('\n').replace(/^\/\*+|\*+\/$/g, '').trim();
				if (text.length > 2) {
					entries.push({ path, line: blockStart + 1, text: text.slice(0, 500), kind: 'block' });
				}
				blockLines = [];
			}
			continue;
		}
		if (BLOCK_COMMENT_START.test(line)) {
			if (line.includes('*/')) {
				const text = line.replace(/^\s*\/\*+|\*+\/\s*$/g, '').trim();
				if (text.length > 2) {
					entries.push({ path, line: i + 1, text: text.slice(0, 500), kind: 'block' });
				}
			} else {
				inBlock = true;
				blockStart = i;
				blockLines = [line];
			}
			continue;
		}
		const match = line.match(LINE_COMMENT);
		if (match?.[2]) {
			const comment = match[2].trim();
			if (comment.length > 2) {
				entries.push({ path, line: i + 1, text: comment.slice(0, 300), kind: 'line' });
			}
		}
	}
	return entries;
}

export function buildCommentsIndex(documents: { path: string; text: string }[]): IQuantumIDECommentsIndex {
	const entries: IQuantumIDECommentIndexEntry[] = [];
	for (const doc of documents) {
		entries.push(...extractCommentsFromText(doc.path, doc.text));
	}
	return {
		version: 1,
		generatedAt: new Date().toISOString(),
		entries,
	};
}

export function buildDiagnosticsIndex(entries: IQuantumIDEDiagnosticIndexEntry[]): IQuantumIDEDiagnosticsIndex {
	return {
		version: 1,
		generatedAt: new Date().toISOString(),
		entries,
	};
}

export function parseCommentsIndexJson(raw: string): IQuantumIDECommentsIndex | undefined {
	try {
		const parsed = JSON.parse(raw) as IQuantumIDECommentsIndex;
		return parsed?.version === 1 && Array.isArray(parsed.entries) ? parsed : undefined;
	} catch {
		return undefined;
	}
}

export function parseDiagnosticsIndexJson(raw: string): IQuantumIDEDiagnosticsIndex | undefined {
	try {
		const parsed = JSON.parse(raw) as IQuantumIDEDiagnosticsIndex;
		return parsed?.version === 1 && Array.isArray(parsed.entries) ? parsed : undefined;
	} catch {
		return undefined;
	}
}

export function searchCommentsIndex(index: IQuantumIDECommentsIndex, query: string, maxResults = 20): readonly IQuantumIDECommentIndexEntry[] {
	const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
	if (terms.length === 0) {
		return [];
	}
	const scores: { entry: IQuantumIDECommentIndexEntry; score: number }[] = [];
	for (const entry of index.entries) {
		const hay = `${entry.path} ${entry.text}`.toLowerCase();
		let score = 0;
		for (const term of terms) {
			if (hay.includes(term)) {
				score++;
			}
		}
		if (score > 0) {
			scores.push({ entry, score });
		}
	}
	return scores.sort((a, b) => b.score - a.score).slice(0, maxResults).map(s => s.entry);
}

export function searchDiagnosticsIndex(index: IQuantumIDEDiagnosticsIndex, query: string, maxResults = 20): readonly IQuantumIDEDiagnosticIndexEntry[] {
	const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
	if (terms.length === 0) {
		return index.entries.filter(e => e.severity === 'error').slice(0, maxResults);
	}
	const scores: { entry: IQuantumIDEDiagnosticIndexEntry; score: number }[] = [];
	for (const entry of index.entries) {
		const hay = `${entry.path} ${entry.message} ${entry.source ?? ''} ${entry.code ?? ''}`.toLowerCase();
		let score = 0;
		for (const term of terms) {
			if (hay.includes(term)) {
				score++;
			}
		}
		if (entry.severity === 'error') {
			score += 0.5;
		}
		if (score > 0) {
			scores.push({ entry, score });
		}
	}
	return scores.sort((a, b) => b.score - a.score).slice(0, maxResults).map(s => s.entry);
}

export function formatDiagnosticsIndexSummary(index: IQuantumIDEDiagnosticsIndex, maxEntries = 12): string {
	const errors = index.entries.filter(e => e.severity === 'error').slice(0, maxEntries);
	const warnings = index.entries.filter(e => e.severity === 'warning').slice(0, Math.max(0, maxEntries - errors.length));
	const lines = [
		`Diagnostics index (${index.generatedAt}): ${index.entries.length} total`,
		...errors.map(e => `ERROR ${e.path}:${e.line} — ${e.message}${e.source ? ` [${e.source}]` : ''}`),
		...warnings.map(e => `WARN ${e.path}:${e.line} — ${e.message}`),
	];
	return lines.join('\n');
}
