/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { basename } from '../../../../base/common/path.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { markQuantumIDEPerformanceEnd, markQuantumIDEPerformanceStart, QuantumIDEPerformanceMark } from '../../../../platform/quantumide/common/quantumidePerformanceMarks.js';
import { QuantumIDEPerformanceBudgetMs, runWithBudget } from '../../../../platform/quantumide/common/quantumidePerformanceBudgets.js';
import { quantumideFuzzyMatchFilePaths } from '../../../../platform/quantumide/common/quantumideFuzzyFileMatch.js';
import { IQuantumIDESemanticIndexService } from '../common/quantumideSemanticIndex.js';
import { IQuantumIDEWorkspaceSymbolIndexService } from '../common/quantumideWorkspaceSymbolIndex.js';
import { IQuantumIDEFileNavigationService } from './quantumideFileNavigationService.js';
import {
	IQuantumIDEInlinePrefetchService,
	IQuantumIDEOfflineService,
	IQuantumIDEOfflineState,
	IQuantumIDETelemetryEvent,
	IQuantumIDETelemetryService,
	IQuantumIDEUnifiedSearchHit,
	IQuantumIDEUnifiedSearchService,
} from '../common/quantumidePlatformOps.js';

const TELEMETRY_ENABLED_KEY = 'quantumide.telemetry.optIn';
const TELEMETRY_EVENTS_KEY = 'quantumide.telemetry.events';
const PREFETCH_MAX = 48;

export class QuantumIDEOfflineService extends Disposable implements IQuantumIDEOfflineService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<IQuantumIDEOfflineState>());
	readonly onDidChange = this._onDidChange.event;

	private _state: IQuantumIDEOfflineState = { online: typeof navigator !== 'undefined' ? navigator.onLine : true, since: Date.now() };

	constructor() {
		super();
		if (typeof window !== 'undefined') {
			const update = () => {
				const online = navigator.onLine;
				if (online !== this._state.online) {
					this._state = { online, since: Date.now() };
					this._onDidChange.fire(this._state);
				}
			};
			this._register({ dispose: () => window.removeEventListener('online', update) });
			this._register({ dispose: () => window.removeEventListener('offline', update) });
			window.addEventListener('online', update);
			window.addEventListener('offline', update);
		}
	}

	getState(): IQuantumIDEOfflineState {
		return this._state;
	}
}

export class QuantumIDETelemetryService extends Disposable implements IQuantumIDETelemetryService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	constructor(
		@IStorageService private readonly _storage: IStorageService,
	) {
		super();
	}

	isEnabled(): boolean {
		return this._storage.getBoolean(TELEMETRY_ENABLED_KEY, StorageScope.APPLICATION, false);
	}

	setEnabled(enabled: boolean): void {
		this._storage.store(TELEMETRY_ENABLED_KEY, enabled, StorageScope.APPLICATION, StorageTarget.USER);
		this._onDidChange.fire();
	}

	record(name: string, properties?: Record<string, string | number | boolean>): void {
		if (!this.isEnabled()) {
			return;
		}
		const events = this._readEvents();
		events.unshift({ name, at: Date.now(), properties });
		if (events.length > 200) {
			events.length = 200;
		}
		this._storage.store(TELEMETRY_EVENTS_KEY, JSON.stringify(events), StorageScope.APPLICATION, StorageTarget.MACHINE);
	}

	getRecent(limit = 50): readonly IQuantumIDETelemetryEvent[] {
		return this._readEvents().slice(0, limit);
	}

	exportJson(): string {
		return JSON.stringify({ enabled: this.isEnabled(), events: this._readEvents() }, null, 2);
	}

	private _readEvents(): IQuantumIDETelemetryEvent[] {
		try {
			const raw = this._storage.get(TELEMETRY_EVENTS_KEY, StorageScope.APPLICATION);
			return raw ? JSON.parse(raw) as IQuantumIDETelemetryEvent[] : [];
		} catch {
			return [];
		}
	}
}

export class QuantumIDEUnifiedSearchService extends Disposable implements IQuantumIDEUnifiedSearchService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IQuantumIDESemanticIndexService private readonly _semantic: IQuantumIDESemanticIndexService,
		@IQuantumIDEWorkspaceSymbolIndexService private readonly _symbols: IQuantumIDEWorkspaceSymbolIndexService,
		@IQuantumIDEFileNavigationService private readonly _files: IQuantumIDEFileNavigationService,
	) {
		super();
	}

	async search(query: string, maxResults = 20): Promise<readonly IQuantumIDEUnifiedSearchHit[]> {
		const q = query.trim();
		if (!q) {
			return [];
		}
		markQuantumIDEPerformanceStart(QuantumIDEPerformanceMark.SemanticSearch);
		const hits: IQuantumIDEUnifiedSearchHit[] = [];
		try {
			await runWithBudget('semanticRetrieval', QuantumIDEPerformanceBudgetMs.semanticRetrieval, async () => {
				const semantic = await this._semantic.searchSemantic(q, Math.ceil(maxResults / 2));
				for (const r of semantic) {
					hits.push({
						path: r.path,
						label: basename(r.path),
						detail: localizeScore(r.score),
						kind: 'semantic',
						score: r.score,
					});
				}
				const symbols = this._symbols.searchSymbols(q, Math.ceil(maxResults / 2));
				for (const s of symbols) {
					hits.push({
						path: s.path,
						line: s.line,
						label: s.name,
						detail: `${s.kind} · ${basename(s.path)}:${s.line}`,
						kind: 'symbol',
						score: 0.9,
						signature: `${s.kind} ${s.name}`,
					});
				}
				const tree = await this._files.listWorkspaceTree(5000);
				const paths = tree.map(e => e.path);
				const fuzzy = quantumideFuzzyMatchFilePaths(q, paths, Math.ceil(maxResults / 3));
				for (const f of fuzzy) {
					if (!hits.some(h => h.path === f.path)) {
						hits.push({
							path: f.path,
							label: basename(f.path),
							detail: 'path match',
							kind: 'file',
							score: f.score,
						});
					}
				}
			});
		} finally {
			markQuantumIDEPerformanceEnd(QuantumIDEPerformanceMark.SemanticSearch);
		}
		return hits.sort((a, b) => b.score - a.score).slice(0, maxResults);
	}
}

function localizeScore(score: number): string {
	return `score ${score.toFixed(2)}`;
}

export class QuantumIDEInlinePrefetchService extends Disposable implements IQuantumIDEInlinePrefetchService {
	declare readonly _serviceBrand: undefined;

	private readonly _cache = new Map<string, string>();

	getCached(uri: string, selectionKey: string): string | undefined {
		return this._cache.get(`${uri}:${selectionKey}`);
	}

	setCached(uri: string, selectionKey: string, suggestion: string): void {
		if (this._cache.size >= PREFETCH_MAX) {
			const first = this._cache.keys().next().value;
			if (first) {
				this._cache.delete(first);
			}
		}
		this._cache.set(`${uri}:${selectionKey}`, suggestion);
	}
}

registerSingleton(IQuantumIDEOfflineService, QuantumIDEOfflineService, InstantiationType.Delayed);
registerSingleton(IQuantumIDETelemetryService, QuantumIDETelemetryService, InstantiationType.Delayed);
registerSingleton(IQuantumIDEUnifiedSearchService, QuantumIDEUnifiedSearchService, InstantiationType.Delayed);
registerSingleton(IQuantumIDEInlinePrefetchService, QuantumIDEInlinePrefetchService, InstantiationType.Delayed);
