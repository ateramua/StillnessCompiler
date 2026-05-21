/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

const TOKEN_PATTERN = /[A-Za-z_][A-Za-z0-9_]{2,}/g;
const STOP_WORDS = new Set([
	'the', 'and', 'for', 'with', 'this', 'that', 'from', 'import', 'export', 'const', 'let', 'var', 'function', 'class', 'return',
]);

export function tokenizeForSemanticIndex(text: string): string[] {
	const tokens: string[] = [];
	let match: RegExpExecArray | null;
	while ((match = TOKEN_PATTERN.exec(text)) !== null) {
		const token = match[0].toLowerCase();
		if (!STOP_WORDS.has(token)) {
			tokens.push(token);
		}
	}
	return tokens;
}

export function buildTermFrequency(tokens: readonly string[]): Record<string, number> {
	const freq: Record<string, number> = {};
	for (const token of tokens) {
		freq[token] = (freq[token] ?? 0) + 1;
	}
	return freq;
}
