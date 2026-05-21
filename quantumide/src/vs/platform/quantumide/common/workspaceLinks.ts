/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

export interface IQuantumIDEWorkspaceLink {
	readonly name: string;
	readonly path: string;
}

export function parseWorkspaceLinksJson(raw: string): IQuantumIDEWorkspaceLink[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return [];
	}
	const roots = Array.isArray(parsed)
		? parsed
		: parsed && typeof parsed === 'object' && Array.isArray((parsed as { roots?: unknown }).roots)
			? (parsed as { roots: unknown[] }).roots
			: [];
	const links: IQuantumIDEWorkspaceLink[] = [];
	for (const entry of roots) {
		if (!entry || typeof entry !== 'object') {
			continue;
		}
		const name = typeof (entry as { name?: unknown }).name === 'string' ? (entry as { name: string }).name.trim() : '';
		const path = typeof (entry as { path?: unknown }).path === 'string' ? (entry as { path: string }).path.trim() : '';
		if (name && path) {
			links.push({ name, path });
		}
	}
	return links;
}
