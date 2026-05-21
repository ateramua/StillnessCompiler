/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

export interface IQuantumIDEKeybindingExportEntry {
	readonly key: string;
	readonly command: string;
	readonly when?: string;
	readonly args?: unknown;
}

export interface IQuantumIDEKeybindingExportDocument {
	readonly version: 1;
	readonly exportedAt: string;
	readonly bindings: readonly IQuantumIDEKeybindingExportEntry[];
}

export function parseQuantumIDEKeybindingImportJson(text: string): IQuantumIDEKeybindingExportEntry[] {
	const parsed = JSON.parse(text) as unknown;
	if (Array.isArray(parsed)) {
		return normalizeKeybindingEntries(parsed);
	}
	if (parsed && typeof parsed === 'object' && Array.isArray((parsed as IQuantumIDEKeybindingExportDocument).bindings)) {
		return normalizeKeybindingEntries((parsed as IQuantumIDEKeybindingExportDocument).bindings);
	}
	throw new Error('Expected a JSON array of keybindings or { "bindings": [...] }.');
}

export function serializeQuantumIDEKeybindingExport(entries: readonly IQuantumIDEKeybindingExportEntry[]): string {
	const doc: IQuantumIDEKeybindingExportDocument = {
		version: 1,
		exportedAt: new Date().toISOString(),
		bindings: entries,
	};
	return JSON.stringify(doc, undefined, 2);
}

function normalizeKeybindingEntries(entries: readonly unknown[]): IQuantumIDEKeybindingExportEntry[] {
	const result: IQuantumIDEKeybindingExportEntry[] = [];
	for (const entry of entries) {
		if (!entry || typeof entry !== 'object') {
			continue;
		}
		const record = entry as Record<string, unknown>;
		const key = typeof record.key === 'string' ? record.key : '';
		const command = typeof record.command === 'string' ? record.command : '';
		if (!key || !command) {
			continue;
		}
		result.push({
			key,
			command,
			when: typeof record.when === 'string' ? record.when : undefined,
			args: record.args,
		});
	}
	return result;
}
