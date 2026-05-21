/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

export interface IQuantumIDEContextSection {
	readonly id: string;
	readonly title: string;
	readonly body: string;
	readonly priority: number;
}

/** Approximate token count (~4 chars per token). */
export function estimateTokens(text: string): number {
	return Math.ceil(text.length / 4);
}

/** Rank and trim context sections to fit token budget (§2.2). */
export function rankAndTrimContextSections(
	sections: readonly IQuantumIDEContextSection[],
	maxTokens: number,
): { included: IQuantumIDEContextSection[]; omitted: string[] } {
	const sorted = [...sections].sort((a, b) => b.priority - a.priority);
	const included: IQuantumIDEContextSection[] = [];
	const omitted: string[] = [];
	let used = 0;
	for (const section of sorted) {
		const tokens = estimateTokens(section.body) + estimateTokens(section.title);
		if (used + tokens <= maxTokens) {
			included.push(section);
			used += tokens;
		} else {
			omitted.push(section.id);
		}
	}
	return { included, omitted };
}

export function formatRankedContext(sections: readonly IQuantumIDEContextSection[], omittedIds?: readonly string[]): string {
	const parts = sections.map(s => (s.title ? `${s.title}\n${s.body}` : s.body));
	if (omittedIds && omittedIds.length > 0) {
		parts.push(`[Context truncated: omitted ${omittedIds.join(', ')} due to token budget]`);
	}
	return parts.join('\n\n');
}
