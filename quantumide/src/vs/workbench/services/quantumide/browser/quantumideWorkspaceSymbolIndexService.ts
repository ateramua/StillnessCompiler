/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../base/common/async.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { relativePath } from '../../../../base/common/resources.js';
import { joinPath } from '../../../../base/common/resources.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { formatQuantumIDEWorkspaceDiscoveryLog } from '../../../../platform/quantumide/common/quantumideWorkspaceDiscoveryLog.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { extractAstSymbolsFromText, QUANTUMIDE_SYMBOL_INDEX_FILE, type IQuantumIDEAstSymbolEntry } from '../../../../platform/quantumide/common/quantumideSemanticIndex.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IQuantumIDEWorkspaceSymbolIndexService } from '../common/quantumideWorkspaceSymbolIndex.js';

const MAX_SYMBOLS = 100_000;
const SHARD_WRITE_THRESHOLD = 50_000;

export class QuantumIDEWorkspaceSymbolIndexService extends Disposable implements IQuantumIDEWorkspaceSymbolIndexService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeIndex = this._register(new Emitter<void>());
	readonly onDidChangeIndex = this._onDidChangeIndex.event;

	private _symbols: IQuantumIDEAstSymbolEntry[] = [];

	private readonly _fileSync = this._register(new RunOnceScheduler(() => void this._syncChangedFiles(), 600));

	constructor(
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IFileService private readonly _fileService: IFileService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		void this._loadFromDisk();
		this._register(this._fileService.onDidFilesChange(e => {
			if (e.rawAdded.length || e.rawUpdated.length || e.rawDeleted.length) {
				this._pendingChanges = e;
				this._fileSync.schedule();
			}
		}));
	}

	private _pendingChanges: import('../../../../platform/files/common/files.js').FileChangesEvent | undefined;

	private async _syncChangedFiles(): Promise<void> {
		const event = this._pendingChanges;
		this._pendingChanges = undefined;
		if (!event) {
			return;
		}
		const folder = this._workspaceContextService.getWorkspace().folders[0];
		if (!folder) {
			return;
		}
		for (const deleted of event.rawDeleted) {
			const rel = relativePath(folder.uri, deleted);
			if (rel) {
				const key = rel.replace(/\\/g, '/');
				this._symbols = this._symbols.filter(s => s.path !== key);
			}
		}
		for (const uri of [...event.rawAdded, ...event.rawUpdated]) {
			const rel = relativePath(folder.uri, uri);
			if (!rel) {
				continue;
			}
			try {
				const text = (await this._fileService.readFile(uri)).value.toString();
				const key = rel.replace(/\\/g, '/');
				this._symbols = this._symbols.filter(s => s.path !== key);
				this._symbols.push(...extractAstSymbolsFromText(key, text));
				if (this._symbols.length > MAX_SYMBOLS) {
					this._symbols = this._symbols.slice(-MAX_SYMBOLS);
				}
			} catch {
				// skip
			}
		}
		await this._persist();
		this._onDidChangeIndex.fire();
		this._logService.debug(formatQuantumIDEWorkspaceDiscoveryLog({
			component: 'workspace-graph',
			operation: 'symbol-index-sync',
			fileCount: this._symbols.length,
		}));
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
		const payload: { version: number; generatedAt: string; symbols: IQuantumIDEAstSymbolEntry[]; sharded?: boolean; shardCount?: number } = {
			version: 1,
			generatedAt: new Date().toISOString(),
			symbols: this._symbols.length > SHARD_WRITE_THRESHOLD ? this._symbols.slice(0, SHARD_WRITE_THRESHOLD) : this._symbols,
		};
		if (this._symbols.length > SHARD_WRITE_THRESHOLD) {
			payload.sharded = true;
			const shards = new Map<string, IQuantumIDEAstSymbolEntry[]>();
			for (const sym of this._symbols) {
				const bucket = (sym.path[0] ?? '_').toLowerCase();
				const list = shards.get(bucket) ?? [];
				list.push(sym);
				shards.set(bucket, list);
			}
			payload.shardCount = shards.size;
			for (const [bucket, list] of shards) {
				await this._fileService.writeFile(
					joinPath(folder.uri, `.quantumide/symbol-index-shard-${bucket}.json`),
					VSBuffer.fromString(JSON.stringify({ version: 1, bucket, symbols: list }, undefined, 2)),
				);
			}
		}
		await this._fileService.writeFile(
			joinPath(folder.uri, QUANTUMIDE_SYMBOL_INDEX_FILE),
			VSBuffer.fromString(JSON.stringify(payload, undefined, 2)),
		);
	}
}

registerSingleton(IQuantumIDEWorkspaceSymbolIndexService, QuantumIDEWorkspaceSymbolIndexService, InstantiationType.Delayed);
