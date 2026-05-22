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

function sectionCharCost(section: IQuantumIDEContextSection): number {
	const titleCost = section.title ? section.title.length + 2 : 0;
	return section.body.length + titleCost;
}

/** Rank and trim context sections to fit character budget (`quantumide.chat.tokenBudget`). */
export function rankAndTrimContextSections(
	sections: readonly IQuantumIDEContextSection[],
	maxChars: number,
): { included: IQuantumIDEContextSection[]; omitted: string[] } {
	if (maxChars <= 0) {
		return { included: [], omitted: sections.map(s => s.id) };
	}
	const sorted = [...sections].sort((a, b) => b.priority - a.priority);
	const included: IQuantumIDEContextSection[] = [];
	const omitted: string[] = [];
	let used = 0;
	for (const section of sorted) {
		const chars = sectionCharCost(section);
		if (used + chars <= maxChars) {
			included.push(section);
			used += chars;
		} else {
			omitted.push(section.id);
		}
	}
	return { included, omitted };
}

export function formatOmittedSectionIdsSummary(omittedIds: readonly string[]): string {
	if (omittedIds.length === 0) {
		return '';
	}
	return `Omitted sections (${omittedIds.length}): ${omittedIds.join(', ')}`;
}

export function formatRankedContext(sections: readonly IQuantumIDEContextSection[], omittedIds?: readonly string[]): string {
	const parts = sections.map(s => (s.title ? `${s.title}\n${s.body}` : s.body));
	const omittedSummary = omittedIds?.length ? formatOmittedSectionIdsSummary(omittedIds) : '';
	if (omittedSummary) {
		parts.push(`[Context truncated — ${omittedSummary} due to token budget]`);
	}
	return parts.join('\n\n');
}
