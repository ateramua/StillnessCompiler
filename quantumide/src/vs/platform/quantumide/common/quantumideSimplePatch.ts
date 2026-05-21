/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/** Applies REPLACE/WITH marker patches (shared by workspace patches and AST-aware patch). */
export function applySimpleUnifiedPatch(original: string, patch: string): string | undefined {
	const replaceMarker = '+++ REPLACE\n';
	const withMarker = '+++ WITH\n';
	const replaceIndex = patch.indexOf(replaceMarker);
	const withIndex = patch.indexOf(withMarker);
	if (replaceIndex === -1 || withIndex === -1) {
		if (!original.trim() && patch.trim()) {
			return patch;
		}
		return undefined;
	}
	const expected = patch.slice(replaceIndex + replaceMarker.length, withIndex).replace(/\r\n/g, '\n');
	const replacement = patch.slice(withIndex + withMarker.length).replace(/\r\n/g, '\n');
	const normalizedOriginal = original.replace(/\r\n/g, '\n');
	if (!normalizedOriginal.includes(expected.trim())) {
		return undefined;
	}
	return normalizedOriginal.replace(expected, replacement.replace(/\n$/, ''));
}
