/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { DocumentSymbol } from '../../../../editor/common/languages.js';
import { IQuantumIDELspSymbolEntry, IQuantumIDELspSymbolIndexService } from '../common/quantumideLspSymbolIndex.js';

const MAX_CACHED_SYMBOLS = 2000;

export class QuantumIDELspSymbolIndexService extends Disposable implements IQuantumIDELspSymbolIndexService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeSymbols = this._register(new Emitter<void>());
	readonly onDidChangeSymbols = this._onDidChangeSymbols.event;

	private _symbols: IQuantumIDELspSymbolEntry[] = [];

	constructor(
		@ICodeEditorService private readonly _codeEditorService: ICodeEditorService,
		@ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService,
	) {
		super();
		this._register(this._codeEditorService.onCodeEditorAdd(() => void this.refreshActiveEditorSymbols()));
	}

	async refreshActiveEditorSymbols(): Promise<void> {
		const editor = this._codeEditorService.getActiveCodeEditor();
		const model = editor?.getModel();
		if (!model) {
			return;
		}
		const providers = this._languageFeaturesService.documentSymbolProvider.ordered(model);
		const merged: IQuantumIDELspSymbolEntry[] = [];
		for (const provider of providers) {
			const raw = await provider.provideDocumentSymbols(model, CancellationToken.None);
			const symbols = raw ? await Promise.resolve(raw) : undefined;
			if (symbols?.length) {
				merged.push(...this._flattenDocumentSymbols(model.uri.fsPath, symbols));
				break;
			}
		}
		this._symbols = merged.slice(0, MAX_CACHED_SYMBOLS);
		this._onDidChangeSymbols.fire();
	}

	async getSymbolGraphPreview(maxEntries = 60): Promise<readonly IQuantumIDELspSymbolEntry[]> {
		if (this._symbols.length === 0) {
			await this.refreshActiveEditorSymbols();
		}
		return this._symbols.slice(0, maxEntries);
	}

	private _flattenDocumentSymbols(path: string, symbols: DocumentSymbol[], container?: string): IQuantumIDELspSymbolEntry[] {
		const entries: IQuantumIDELspSymbolEntry[] = [];
		for (const sym of symbols) {
			entries.push({
				name: sym.name,
				kind: String(sym.kind),
				path,
				line: sym.range.startLineNumber,
				container,
			});
			if (sym.children?.length) {
				entries.push(...this._flattenDocumentSymbols(path, sym.children, sym.name));
			}
		}
		return entries;
	}

	async findImplementations(symbol: string, maxResults = 30): Promise<readonly IQuantumIDELspSymbolEntry[]> {
		const needle = symbol.trim().toLowerCase();
		if (!needle) {
			return [];
		}
		return this._symbols
			.filter(s => s.name.toLowerCase().includes(needle) || s.name.toLowerCase() === needle)
			.slice(0, maxResults);
	}
}

registerSingleton(IQuantumIDELspSymbolIndexService, QuantumIDELspSymbolIndexService, InstantiationType.Delayed);
