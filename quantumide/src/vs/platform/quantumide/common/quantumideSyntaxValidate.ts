/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

export interface IQuantumIDESyntaxValidationResult {
	readonly ok: boolean;
	readonly message?: string;
}

import { validateAstAwarePatch } from './quantumideAstPatch.js';

export function validateSourceSyntax(path: string, content: string): IQuantumIDESyntaxValidationResult {
	const ast = validateAstAwarePatch(path, content);
	if (!ast.ok) {
		return { ok: false, message: ast.message };
	}
	const ext = path.split('.').pop()?.toLowerCase() ?? '';
	if (ext === 'json') {
		try {
			JSON.parse(content);
			return { ok: true };
		} catch (error) {
			return { ok: false, message: error instanceof Error ? error.message : String(error) };
		}
	}
	if (ext === 'ts' || ext === 'tsx' || ext === 'js' || ext === 'jsx') {
		return validateJavaScriptLike(content);
	}
	return { ok: true };
}

function validateJavaScriptLike(content: string): IQuantumIDESyntaxValidationResult {
	let braces = 0;
	let brackets = 0;
	let parens = 0;
	let inString: '"' | "'" | '`' | undefined;
	let escape = false;
	for (let i = 0; i < content.length; i++) {
		const ch = content[i];
		if (inString) {
			if (escape) {
				escape = false;
				continue;
			}
			if (ch === '\\') {
				escape = true;
				continue;
			}
			if (ch === inString) {
				inString = undefined;
			}
			continue;
		}
		if (ch === '"' || ch === '\'' || ch === '`') {
			inString = ch;
			continue;
		}
		if (ch === '{') { braces++; }
		if (ch === '}') { braces--; }
		if (ch === '[') { brackets++; }
		if (ch === ']') { brackets--; }
		if (ch === '(') { parens++; }
		if (ch === ')') { parens--; }
	}
	if (braces !== 0 || brackets !== 0 || parens !== 0) {
		return { ok: false, message: `Unbalanced delimiters ({}:${braces} []:${brackets} ():${parens})` };
	}
	return { ok: true };
}
