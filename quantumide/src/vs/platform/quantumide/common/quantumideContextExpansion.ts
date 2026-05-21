/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

export interface IQuantumIDEContextExpansionHit {
	readonly path: string;
	readonly reason: string;
	readonly score: number;
	readonly excerpt?: string;
	readonly line?: number;
}

export interface IQuantumIDEContextExpansionResult {
	readonly query: string;
	readonly hits: readonly IQuantumIDEContextExpansionHit[];
	readonly relatedPaths: readonly string[];
}

export function expandContextFromSymbols(
	query: string,
	symbols: readonly { path: string; name: string; kind: string; line: number }[],
	fileContents: ReadonlyMap<string, string>,
	maxHits = 12,
): IQuantumIDEContextExpansionResult {
	const terms = tokenizeQuery(query);
	const scored: IQuantumIDEContextExpansionHit[] = [];
	for (const sym of symbols) {
		let score = 0;
		for (const term of terms) {
			if (sym.name.toLowerCase().includes(term)) {
				score += 10;
			}
			if (sym.path.toLowerCase().includes(term)) {
				score += 3;
			}
			if (sym.kind.toLowerCase().includes(term)) {
				score += 2;
			}
		}
		if (score <= 0) {
			continue;
		}
		const content = fileContents.get(sym.path);
		let excerpt: string | undefined;
		if (content) {
			const lines = content.split(/\r?\n/);
			const start = Math.max(0, sym.line - 3);
			excerpt = lines.slice(start, start + 8).join('\n');
		}
		scored.push({
			path: sym.path,
			reason: `${sym.kind} ${sym.name}`,
			score,
			line: sym.line,
			excerpt,
		});
	}
	scored.sort((a, b) => b.score - a.score);
	const hits = dedupeByPath(scored).slice(0, maxHits);
	return {
		query,
		hits,
		relatedPaths: hits.map(h => h.path),
	};
}

export function formatContextExpansion(result: IQuantumIDEContextExpansionResult): string {
	if (result.hits.length === 0) {
		return `No related context found for: "${result.query}"`;
	}
	const lines = [`Auto-expanded context for: "${result.query}"`, ''];
	for (const hit of result.hits) {
		lines.push(`### ${hit.path}${hit.line ? `:${hit.line}` : ''} (${hit.reason}, score ${hit.score})`);
		if (hit.excerpt) {
			lines.push('```', hit.excerpt.slice(0, 800), '```');
		}
	}
	return lines.join('\n');
}

function tokenizeQuery(query: string): string[] {
	return query.toLowerCase().split(/[^a-z0-9_]+/).filter(t => t.length > 2);
}

function dedupeByPath(hits: IQuantumIDEContextExpansionHit[]): IQuantumIDEContextExpansionHit[] {
	const seen = new Set<string>();
	const out: IQuantumIDEContextExpansionHit[] = [];
	for (const hit of hits) {
		if (seen.has(hit.path)) {
			continue;
		}
		seen.add(hit.path);
		out.push(hit);
	}
	return out;
}
