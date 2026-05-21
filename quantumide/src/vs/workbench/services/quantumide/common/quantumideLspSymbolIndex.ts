/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { URI } from '../../../../base/common/uri.js';

export interface IQuantumIDELspSymbolEntry {
	readonly name: string;
	readonly kind: string;
	readonly path: string;
	readonly line: number;
	readonly container?: string;
}

export interface IQuantumIDELspSymbolIndexService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeSymbols: Event<void>;
	getSymbolGraphPreview(maxEntries?: number): Promise<readonly IQuantumIDELspSymbolEntry[]>;
	refreshActiveEditorSymbols(): Promise<void>;
	findImplementations(symbol: string, maxResults?: number): Promise<readonly IQuantumIDELspSymbolEntry[]>;
}

export const IQuantumIDELspSymbolIndexService = createDecorator<IQuantumIDELspSymbolIndexService>('quantumIDELspSymbolIndexService');

export async function collectDocumentSymbols(
	uri: URI,
	languageId: string,
	documentSymbolProvider: { provideDocumentSymbols(model: unknown, token: CancellationToken): Promise<unknown[] | undefined> },
	model: unknown,
	token: CancellationToken,
): Promise<IQuantumIDELspSymbolEntry[]> {
	const symbols = await documentSymbolProvider.provideDocumentSymbols(model, token);
	if (!symbols?.length) {
		return [];
	}
	const path = uri.fsPath;
	const entries: IQuantumIDELspSymbolEntry[] = [];
	const walk = (items: unknown[], container?: string): void => {
		for (const item of items) {
			const sym = item as { name: string; kind: number; range?: { startLineNumber: number }; children?: unknown[] };
			if (!sym?.name) {
				continue;
			}
			entries.push({
				name: sym.name,
				kind: String(sym.kind),
				path,
				line: sym.range?.startLineNumber ?? 1,
				container,
			});
			if (sym.children?.length) {
				walk(sym.children, sym.name);
			}
		}
	};
	walk(symbols);
	return entries;
}
