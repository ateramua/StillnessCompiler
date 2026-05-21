/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { computeLineDiffHunks, type IQuantumIDEDiffHunk } from './quantumideDiffHunks.js';
import { extractAstSymbolsFromText, type IQuantumIDEAstSymbolEntry } from './quantumideAstSymbols.js';
import { loadIncrementalVectorSearch } from './quantumideIncrementalVectorStore.js';
import { searchVectorIndex, type IQuantumIDEVectorIndex } from './quantumideVectorEmbeddings.js';
import type { IFileService } from '../../files/common/files.js';
import { URI } from '../../../base/common/uri.js';

/** §4.2 recommended stack component identifiers. */
export const enum QuantumIDETechStackComponent {
	Editor = 'editor',
	Parser = 'parser',
	Terminal = 'terminal',
	VectorStore = 'vectorStore',
	Transport = 'transport',
	State = 'state',
	Embeddings = 'embeddings',
	DiffEngine = 'diffEngine',
}

export interface IQuantumIDETechStackBinding {
	readonly component: QuantumIDETechStackComponent;
	readonly recommended: string;
	readonly deployed: string;
	readonly notes?: string;
}

export const QUANTUMIDE_TECH_STACK_BINDINGS: readonly IQuantumIDETechStackBinding[] = [
	{ component: QuantumIDETechStackComponent.Editor, recommended: 'Monaco / VS Code OSS', deployed: 'VS Code OSS (Monaco)', notes: 'Native workbench editor.' },
	{ component: QuantumIDETechStackComponent.Parser, recommended: 'Tree-sitter', deployed: 'Tree-sitter WASM + regex fallback', notes: 'QuantumIDE registers Tree-sitter parser adapter when grammars are available.' },
	{ component: QuantumIDETechStackComponent.Terminal, recommended: 'xterm.js', deployed: 'xterm.js (integrated terminal)', notes: 'PTY via workbench terminal service.' },
	{ component: QuantumIDETechStackComponent.VectorStore, recommended: 'LanceDB / Qdrant', deployed: 'Incremental chunked store + optional LanceDB', notes: 'Set quantumide.indexing.vectorStore to incremental or lancedb.' },
	{ component: QuantumIDETechStackComponent.Transport, recommended: 'gRPC / WebSockets', deployed: 'Event-driven local bus', notes: 'Cross-layer events; remote transport pluggable.' },
	{ component: QuantumIDETechStackComponent.State, recommended: 'Event-driven store', deployed: 'QuantumIDE event state store', notes: 'Session-scoped event log for platform diagnostics.' },
	{ component: QuantumIDETechStackComponent.Embeddings, recommended: 'Local embedding runtime / OpenAI', deployed: '256-dim local or OpenAI text-embedding-3-small', notes: 'Controlled by quantumide.indexing.embeddingProvider.' },
	{ component: QuantumIDETechStackComponent.DiffEngine, recommended: 'AST-aware patch engine', deployed: 'Line-hunk diff + edit engine', notes: 'Coordinated multi-file edits with conflict detection.' },
];

export interface IQuantumIDEParserAdapter {
	readonly id: string;
	extractSymbols(path: string, text: string, maxPerFile?: number): readonly IQuantumIDEAstSymbolEntry[];
}

export interface IQuantumIDEVectorStoreAdapter {
	readonly id: string;
	search(index: IQuantumIDEVectorIndex, query: string, maxResults?: number): readonly { path: string; score: number }[];
}

export interface IQuantumIDEDiffEngineAdapter {
	readonly id: string;
	computeHunks(before: string, after: string): readonly IQuantumIDEDiffHunk[];
}

export interface IQuantumIDEStateStoreAdapter {
	readonly id: string;
	readonly onDidAppend: Event<IQuantumIDEStateEvent>;
	append(event: IQuantumIDEStateEvent): void;
	getEvents(sessionId?: string, limit?: number): readonly IQuantumIDEStateEvent[];
}

export interface IQuantumIDETransportAdapter {
	readonly id: string;
	readonly onMessage: Event<IQuantumIDETransportMessage>;
	publish(message: IQuantumIDETransportMessage): void;
}

export interface IQuantumIDEStateEvent {
	readonly sessionId: string;
	readonly layer: string;
	readonly kind: string;
	readonly timestamp: number;
	readonly payload?: Record<string, unknown>;
}

export interface IQuantumIDETransportMessage {
	readonly channel: string;
	readonly layer: string;
	readonly payload: Record<string, unknown>;
}

export class QuantumIDERegexParserAdapter implements IQuantumIDEParserAdapter {
	readonly id = 'regex-ast';
	extractSymbols(path: string, text: string, maxPerFile = 80): readonly IQuantumIDEAstSymbolEntry[] {
		return extractAstSymbolsFromText(path, text, maxPerFile);
	}
}

export class QuantumIDELocalVectorStoreAdapter implements IQuantumIDEVectorStoreAdapter {
	readonly id = 'local-vector-json';
	search(index: IQuantumIDEVectorIndex, query: string, maxResults = 20): readonly { path: string; score: number }[] {
		return searchVectorIndex(index, query, maxResults);
	}
}

/** Chunked on-disk vector store (browser-safe; used when IFileService + workspace root are wired). */
export class QuantumIDEIncrementalVectorStoreAdapter implements IQuantumIDEVectorStoreAdapter {
	readonly id = 'incremental-vector-chunks';

	constructor(
		private readonly _fileService: IFileService,
		private readonly _workspaceRoot: URI,
	) { }

	search(index: IQuantumIDEVectorIndex, query: string, maxResults = 20): readonly { path: string; score: number }[] {
		void index;
		void this._fileService;
		void this._workspaceRoot;
		return searchVectorIndex(index, query, maxResults);
	}

	async searchAsync(query: string, maxResults = 20): Promise<readonly { path: string; score: number }[]> {
		return loadIncrementalVectorSearch(this._fileService, this._workspaceRoot, query, maxResults);
	}
}

export function setQuantumIDEIncrementalVectorStoreAdapter(fileService: IFileService, workspaceRoot: URI): void {
	defaultVectorStore = new QuantumIDEIncrementalVectorStoreAdapter(fileService, workspaceRoot);
}

export class QuantumIDELineHunkDiffAdapter implements IQuantumIDEDiffEngineAdapter {
	readonly id = 'line-hunk-diff';
	computeHunks(before: string, after: string): readonly IQuantumIDEDiffHunk[] {
		return computeLineDiffHunks(before, after);
	}
}

export class QuantumIDEEventStateStore implements IQuantumIDEStateStoreAdapter {
	readonly id = 'event-store';
	private readonly _events: IQuantumIDEStateEvent[] = [];
	private readonly _onDidAppend = new Emitter<IQuantumIDEStateEvent>();
	readonly onDidAppend = this._onDidAppend.event;

	append(event: IQuantumIDEStateEvent): void {
		this._events.push(event);
		if (this._events.length > 5000) {
			this._events.splice(0, this._events.length - 4000);
		}
		this._onDidAppend.fire(event);
	}

	getEvents(sessionId?: string, limit = 100): readonly IQuantumIDEStateEvent[] {
		const filtered = sessionId ? this._events.filter(e => e.sessionId === sessionId) : this._events;
		return filtered.slice(-limit);
	}
}

export class QuantumIDELocalEventTransport implements IQuantumIDETransportAdapter {
	readonly id = 'local-event-bus';
	private readonly _onMessage = new Emitter<IQuantumIDETransportMessage>();
	readonly onMessage = this._onMessage.event;

	publish(message: IQuantumIDETransportMessage): void {
		this._onMessage.fire(message);
	}
}

let defaultParser: IQuantumIDEParserAdapter = new QuantumIDERegexParserAdapter();
let defaultVectorStore: IQuantumIDEVectorStoreAdapter = new QuantumIDELocalVectorStoreAdapter();
let defaultDiffEngine: IQuantumIDEDiffEngineAdapter = new QuantumIDELineHunkDiffAdapter();
let defaultStateStore: IQuantumIDEStateStoreAdapter = new QuantumIDEEventStateStore();
let defaultTransport: IQuantumIDETransportAdapter = new QuantumIDELocalEventTransport();

export function getDefaultQuantumIDEParserAdapter(): IQuantumIDEParserAdapter {
	return defaultParser;
}

export function getDefaultQuantumIDEVectorStoreAdapter(): IQuantumIDEVectorStoreAdapter {
	return defaultVectorStore;
}

export function getDefaultQuantumIDEDiffEngineAdapter(): IQuantumIDEDiffEngineAdapter {
	return defaultDiffEngine;
}

export function getDefaultQuantumIDEStateStoreAdapter(): IQuantumIDEStateStoreAdapter {
	return defaultStateStore;
}

export function getDefaultQuantumIDETransportAdapter(): IQuantumIDETransportAdapter {
	return defaultTransport;
}

export function setDefaultQuantumIDEParserAdapter(adapter: IQuantumIDEParserAdapter): void {
	defaultParser = adapter;
}

export function setDefaultQuantumIDEVectorStoreAdapter(adapter: IQuantumIDEVectorStoreAdapter): void {
	defaultVectorStore = adapter;
}

export function formatQuantumIDETechStackReport(): string {
	return QUANTUMIDE_TECH_STACK_BINDINGS
		.map(b => `${b.component}: ${b.deployed} (recommended: ${b.recommended})${b.notes ? ` — ${b.notes}` : ''}`)
		.join('\n');
}
