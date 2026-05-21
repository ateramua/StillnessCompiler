/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../base/common/buffer.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { joinPath } from '../../../../base/common/resources.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { extractAstSymbolsFromText, QUANTUMIDE_SYMBOL_INDEX_FILE, type IQuantumIDEAstSymbolEntry } from '../../../../platform/quantumide/common/quantumideSemanticIndex.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IQuantumIDEWorkspaceSymbolIndexService } from '../common/quantumideWorkspaceSymbolIndex.js';

const MAX_SYMBOLS = 8000;

export class QuantumIDEWorkspaceSymbolIndexService extends Disposable implements IQuantumIDEWorkspaceSymbolIndexService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeIndex = this._register(new Emitter<void>());
	readonly onDidChangeIndex = this._onDidChangeIndex.event;

	private _symbols: IQuantumIDEAstSymbolEntry[] = [];

	constructor(
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IFileService private readonly _fileService: IFileService,
	) {
		super();
		void this._loadFromDisk();
	}

	getSymbols(): readonly IQuantumIDEAstSymbolEntry[] {
		return this._symbols;
	}

	searchSymbols(query: string, maxResults = 50): readonly IQuantumIDEAstSymbolEntry[] {
		const needle = query.trim().toLowerCase();
		if (!needle) {
			return [];
		}
		return this._symbols
			.filter(s => s.name.toLowerCase().includes(needle))
			.slice(0, maxResults);
	}

	updateFileSymbols(path: string, text: string): void {
		const normalized = path.replace(/\\/g, '/');
		this._symbols = this._symbols.filter(s => s.path !== normalized);
		this._symbols.push(...extractAstSymbolsFromText(normalized, text));
		if (this._symbols.length > MAX_SYMBOLS) {
			this._symbols = this._symbols.slice(-MAX_SYMBOLS);
		}
		void this._persist();
		this._onDidChangeIndex.fire();
	}

	async refreshWorkspaceSymbols(symbols: readonly IQuantumIDEAstSymbolEntry[]): Promise<void> {
		this._symbols = symbols.slice(0, MAX_SYMBOLS);
		await this._persist();
		this._onDidChangeIndex.fire();
	}

	private async _loadFromDisk(): Promise<void> {
		const folder = this._workspaceContextService.getWorkspace().folders[0];
		if (!folder) {
			return;
		}
		try {
			const raw = (await this._fileService.readFile(joinPath(folder.uri, QUANTUMIDE_SYMBOL_INDEX_FILE))).value.toString();
			const parsed = JSON.parse(raw) as { symbols?: IQuantumIDEAstSymbolEntry[] };
			if (Array.isArray(parsed.symbols)) {
				this._symbols = parsed.symbols;
			}
		} catch {
			// ignore
		}
	}

	private async _persist(): Promise<void> {
		const folder = this._workspaceContextService.getWorkspace().folders[0];
		if (!folder) {
			return;
		}
		await this._fileService.createFolder(joinPath(folder.uri, '.quantumide'));
		await this._fileService.writeFile(
			joinPath(folder.uri, QUANTUMIDE_SYMBOL_INDEX_FILE),
			VSBuffer.fromString(JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), symbols: this._symbols }, undefined, 2)),
		);
	}
}

registerSingleton(IQuantumIDEWorkspaceSymbolIndexService, QuantumIDEWorkspaceSymbolIndexService, InstantiationType.Delayed);
