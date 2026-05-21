/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

export interface IQuantumIDEReviewFileChange {
	readonly path: string;
	readonly status: string;
}

export function formatReviewSummary(changes: readonly IQuantumIDEReviewFileChange[], maxFiles = 40): string {
	if (changes.length === 0) {
		return 'No SCM changes to review.';
	}
	const lines = changes.slice(0, maxFiles).map(c => `- ${c.path} (${c.status})`);
	if (changes.length > maxFiles) {
		lines.push(`- ...and ${changes.length - maxFiles} more`);
	}
	return [
		'Review mode — analyze the following changes. Lead with findings (bugs, risks, style). Do not modify files unless asked.',
		'',
		`Changed files (${changes.length}):`,
		...lines,
	].join('\n');
}
