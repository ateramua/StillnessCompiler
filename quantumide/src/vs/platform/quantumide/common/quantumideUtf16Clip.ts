/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/** Clip without splitting UTF-16 surrogate pairs (M-06). */
export function clipQuantumIDEUtf16Safe(value: string, maxChars: number): string {
	if (maxChars <= 0) {
		return '';
	}
	if (value.length <= maxChars) {
		return value;
	}
	let end = maxChars;
	if (end < value.length) {
		const code = value.charCodeAt(end - 1);
		if (code >= 0xD800 && code <= 0xDBFF) {
			end--;
		}
	}
	return value.slice(0, end);
}
