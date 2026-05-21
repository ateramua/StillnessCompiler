/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { applySimpleUnifiedPatch } from './quantumideSimplePatch.js';

export interface IQuantumIDEAstPatchResult {
	readonly ok: boolean;
	readonly patched?: string;
	readonly message?: string;
}

/**
 * AST-scoped patch application: prefers structured REPLACE/WITH hunks, then falls back to
 * full-file replacement when the patch body is complete source (§2.8).
 */
export function applyAstAwarePatch(original: string, patch: string): IQuantumIDEAstPatchResult {
	const structured = applySimpleUnifiedPatch(original, patch);
	if (structured !== undefined) {
		return { ok: true, patched: structured };
	}
	const trimmed = patch.trim();
	if (trimmed.includes('+++ REPLACE') || trimmed.includes('+++ WITH')) {
		return { ok: false, message: 'Structured patch markers did not match file content.' };
	}
	if (trimmed.length > 0) {
		return { ok: true, patched: patch };
	}
	return { ok: false, message: 'Empty patch body.' };
}

/** Validates that a patched body preserves balanced JS/TS delimiters (lightweight AST guard). */
export function validateAstAwarePatch(path: string, patched: string): { ok: boolean; message?: string } {
	const ext = path.split('.').pop()?.toLowerCase() ?? '';
	if (!['ts', 'tsx', 'js', 'jsx'].includes(ext)) {
		return { ok: true };
	}
	let braces = 0;
	let brackets = 0;
	let parens = 0;
	for (const ch of patched) {
		if (ch === '{') { braces++; }
		if (ch === '}') { braces--; }
		if (ch === '[') { brackets++; }
		if (ch === ']') { brackets--; }
		if (ch === '(') { parens++; }
		if (ch === ')') { parens--; }
	}
	if (braces !== 0 || brackets !== 0 || parens !== 0) {
		return { ok: false, message: `Unbalanced delimiters after patch ({}:${braces} []:${brackets} ():${parens}).` };
	}
	return { ok: true };
}
