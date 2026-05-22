/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../base/common/async.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { QuantumIDEAISettingId } from '../../../../platform/quantumide/common/quantumideAISettings.js';
import {
	buildCommentsIndex,
	buildDiagnosticsIndex,
	parseCommentsIndexJson,
	parseDiagnosticsIndexJson,
	QUANTUMIDE_COMMENTS_INDEX_FILE,
	QUANTUMIDE_DIAGNOSTICS_INDEX_FILE,
	searchCommentsIndex,
	searchDiagnosticsIndex,
	type IQuantumIDECommentsIndex,
	type IQuantumIDEDiagnosticsIndex,
	type IQuantumIDEDiagnosticIndexEntry,
} from '../../../../platform/quantumide/common/quantumideIndexAugment.js';
import {
	buildSemanticShardMeta,
	mergeSemanticShards,
	QUANTUMIDE_SEMANTIC_SHARD_DIR,
	semanticShardFileName,
	shardSemanticDocuments,
	type IQuantumIDESemanticShardMeta,
} from '../../../../platform/quantumide/common/quantumideIndexShards.js';
import { collectIndexCandidatesChunked } from '../../../../platform/quantumide/common/quantumideChunkedIndexScanner.js';
import { resolveQuantumIDEIndexScaleLimits } from '../../../../platform/quantumide/common/quantumideIndexScale.js';
import { formatQuantumIDEIndexingSyncLog } from '../../../../platform/quantumide/common/quantumideIndexingSyncLog.js';
import { formatQuantumIDEWorkspaceDiscoveryLog } from '../../../../platform/quantumide/common/quantumideWorkspaceDiscoveryLog.js';
import { loadIncrementalVectorSearch, persistIncrementalVectorStore } from '../../../../platform/quantumide/common/quantumideIncrementalVectorStore.js';
import { fetchOpenAIEmbeddings } from '../../../../platform/quantumide/common/quantumideOpenAIEmbeddings.js';
import { buildDependencyGraph, type IQuantumIDEDependencyGraph } from '../../../../platform/quantumide/common/quantumideDependencyGraph.js';
import { isQuantumIDEPathIgnored } from '../../../../platform/quantumide/common/quantumideWorkspaceIgnore.js';
import {
	buildAstIndex,
	buildSemanticIndex,
	QUANTUMIDE_AST_INDEX_FILE,
	QUANTUMIDE_DEPENDENCY_GRAPH_FILE,
	QUANTUMIDE_SEMANTIC_INDEX_FILE,
	QUANTUMIDE_VECTOR_INDEX_FILE,
	parseAstIndexJson,
	parseSemanticIndexJson,
	searchSemanticIndex,
	type IQuantumIDEAstIndex,
	type IQuantumIDESemanticIndex,
} from '../../../../platform/quantumide/common/quantumideSemanticIndex.js';
import { markQuantumIDEPerformanceEnd, markQuantumIDEPerformanceStart, QuantumIDEPerformanceMark } from '../../../../platform/quantumide/common/quantumidePerformanceMarks.js';
import { getDefaultQuantumIDEParserAdapter, getDefaultQuantumIDEVectorStoreAdapter, setQuantumIDEIncrementalVectorStoreAdapter } from '../../../../platform/quantumide/common/quantumideTechStackAdapters.js';
import {
	decryptQuantumIDEIndexPayload,
	encryptQuantumIDEIndexPayload,
	isEncryptedQuantumIDEIndexPayload,
} from '../../../../platform/quantumide/common/quantumideCacheEncryption.js';
import { recordQuantumIDESemanticIncrementalFileLatency } from '../../../../platform/quantumide/common/quantumideWorkspaceDiscoveryTelemetry.js';
import { applyQuantumIDESemanticIncrementalCore } from '../../../../platform/quantumide/common/quantumideSemanticIncrementalCore.js';
import { assertWithinBudget, QuantumIDEPerformanceBudgetMs, runWithBudget } from '../../../../platform/quantumide/common/quantumidePerformanceBudgets.js';
import type { IQuantumIDEWorkspaceIgnorePolicy } from '../../../../platform/quantumide/common/quantumideWorkspaceIgnore.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { EditorResourceAccessor, SideBySideEditor } from '../../../common/editor.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import {
	embedText,
	parseVectorIndexJson,
	serializeVectorIndex,
	type IQuantumIDEVectorIndex,
} from '../../../../platform/quantumide/common/quantumideVectorEmbeddings.js';
import { MarkerSeverity } from '../../../../platform/markers/common/markers.js';
import { IMarkerService } from '../../../../platform/markers/common/markers.js';
import { ISecretStorageService } from '../../../../platform/secrets/common/secrets.js';
import { QuantumIDEOpenAIApiKeySecretStorageKey } from '../../../../platform/quantumide/common/quantumideAISettings.js';
import { IWorkspaceTrustManagementService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IQuantumIDEWorkspaceContextService } from '../common/quantumideWorkspaceContext.js';
import { IQuantumIDESemanticIndexService } from '../common/quantumideSemanticIndex.js';
import { IQuantumIDEWorkspaceSymbolIndexService } from '../common/quantumideWorkspaceSymbolIndex.js';
import { IQuantumIDEWorkspaceIgnoreService } from '../common/quantumideWorkspaceIgnoreService.js';
import { IQuantumIDEIndexerCpuWorkerService } from './quantumideIndexerCpuWorkerService.js';
import { IQuantumIDEIndexerWorkerScheduler } from './quantumideIndexerWorkerScheduler.js';
import {
	beginQuantumIDEIndexingMainThreadSession,
	endQuantumIDEIndexingMainThreadSession,
	recordQuantumIDEIndexingMainThreadSlice,
} from '../../../../platform/quantumide/common/quantumideMainThreadLongTask.js';

import { QUANTUMIDE_VECTOR_STORE_DIR } from '../../../../platform/quantumide/common/quantumideIncrementalVectorStore.js';

export const QUANTUMIDE_GIT_INDEX_FILE = '.quantumide/git-index.json';
const INDEXABLE_EXT = /\.(ts|tsx|js|jsx|py|go|rs|java|cs|md|json|yaml|yml|toml)$/i;
export class QuantumIDESemanticIndexService extends Disposable implements IQuantumIDESemanticIndexService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeIndex = this._register(new Emitter<void>());
	readonly onDidChangeIndex = this._onDidChangeIndex.event;

	private _semanticIndex: IQuantumIDESemanticIndex | undefined;
	private _astIndex: IQuantumIDEAstIndex | undefined;
	private _vectorIndex: IQuantumIDEVectorIndex | undefined;
	private _dependencyGraph: IQuantumIDEDependencyGraph | undefined;
	private _commentsIndex: IQuantumIDECommentsIndex | undefined;
	private _diagnosticsIndex: IQuantumIDEDiagnosticsIndex | undefined;
	private _cachedIndexPolicy: IQuantumIDEWorkspaceIgnorePolicy | undefined;
	private _lastActiveEditorUri: URI | undefined;
	private readonly _activeEditorModelListener = this._register(new MutableDisposable());
	private readonly _activeEditorContentScheduler = this._register(new RunOnceScheduler(() => {
		const uri = this._lastActiveEditorUri;
		if (uri) {
			this._indexerWorker.scheduleIncrementalFile(uri, 'active');
		}
	}, 200));
	private readonly _persistIncrementalScheduler = this._register(new RunOnceScheduler(() => {
		const folder = this._workspaceContextService.getWorkspace().folders[0];
		if (folder) {
			void this._persistIndexes(folder.uri);
		}
	}, 2000));

	constructor(
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IFileService private readonly _fileService: IFileService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ILogService private readonly _logService: ILogService,
		@IQuantumIDEWorkspaceContextService private readonly _quantumIDEWorkspaceContextService: IQuantumIDEWorkspaceContextService,
		@IQuantumIDEWorkspaceSymbolIndexService private readonly _workspaceSymbolIndexService: IQuantumIDEWorkspaceSymbolIndexService,
		@IMarkerService private readonly _markerService: IMarkerService,
		@ISecretStorageService private readonly _secretStorageService: ISecretStorageService,
		@IQuantumIDEIndexerWorkerScheduler private readonly _indexerWorker: IQuantumIDEIndexerWorkerScheduler,
		@IQuantumIDEIndexerCpuWorkerService private readonly _indexerCpuWorker: IQuantumIDEIndexerCpuWorkerService,
		@IQuantumIDEWorkspaceIgnoreService private readonly _ignoreService: IQuantumIDEWorkspaceIgnoreService,
		@IWorkspaceTrustManagementService private readonly _workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@IEditorService private readonly _editorService: IEditorService,
		@ICodeEditorService private readonly _codeEditorService: ICodeEditorService,
	) {
		super();
		void this._loadStoredIndexes();
		void this._warmIndexIgnorePolicy();
		this._register(this._editorService.onDidActiveEditorChange(() => this._scheduleActiveEditorIncremental()));
		this._register(this._quantumIDEWorkspaceContextService.onDidChangeGraph(() => {
			if (this._configurationService.getValue<boolean>(QuantumIDEAISettingId.SemanticIndexingEnabled) === true) {
				void this.refreshIndexes('workspace graph changed');
			}
		}));
		this._register(this._fileService.onDidFilesChange(e => {
			if (this._configurationService.getValue<boolean>(QuantumIDEAISettingId.IndexingEnabled) !== true) {
				return;
			}
			for (const resource of e.rawUpdated) {
				this._indexerWorker.scheduleIncrementalFile(resource);
			}
			for (const resource of e.rawAdded) {
				this._indexerWorker.scheduleIncrementalFile(resource);
			}
		}));
	}

	async incrementalUpdateFile(resource: URI): Promise<void> {
		await runWithBudget('semanticIncrementalFile', QuantumIDEPerformanceBudgetMs.semanticIncrementalFile, async () => {
			await this._incrementalUpdateFile(resource, true);
		});
	}

	private _scheduleActiveEditorIncremental(): void {
		if (this._configurationService.getValue<boolean>(QuantumIDEAISettingId.SemanticIndexingEnabled) !== true
			&& this._configurationService.getValue<boolean>(QuantumIDEAISettingId.IndexingEnabled) !== true) {
			return;
		}
		const uri = EditorResourceAccessor.getCanonicalUri(this._editorService.activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY });
		if (!uri || uri.scheme !== 'file') {
			this._activeEditorModelListener.clear();
			return;
		}
		this._lastActiveEditorUri = uri;
		this._indexerWorker.scheduleIncrementalFile(uri, 'active');
		this._attachActiveEditorModelListener();
	}

	private _attachActiveEditorModelListener(): void {
		this._activeEditorModelListener.clear();
		const editor = this._codeEditorService.getActiveCodeEditor();
		if (!editor?.hasModel()) {
			return;
		}
		this._activeEditorModelListener.value = editor.onDidChangeModelContent(() => {
			const modelUri = editor.getModel()?.uri;
			if (modelUri) {
				this._lastActiveEditorUri = modelUri;
				this._activeEditorContentScheduler.schedule();
			}
		});
	}

	private async _warmIndexIgnorePolicy(): Promise<IQuantumIDEWorkspaceIgnorePolicy> {
		if (!this._cachedIndexPolicy) {
			this._cachedIndexPolicy = await this._ignoreService.getPolicy();
		}
		return this._cachedIndexPolicy;
	}

	private async _incrementalUpdateFile(resource: URI, useCpuWorker = true): Promise<void> {
		if (!this._workspaceTrustManagementService.isWorkspaceTrusted()) {
			return;
		}
		const folder = this._workspaceContextService.getWorkspaceFolder(resource);
		if (!folder) {
			return;
		}
		const relPath = resource.fsPath.slice(folder.uri.fsPath.length + 1);
		const policy = await this._warmIndexIgnorePolicy();
		if (!INDEXABLE_EXT.test(resource.path) || isQuantumIDEPathIgnored(relPath, policy, 'index', resource.path.split('/').pop())) {
			return;
		}
		const start = performance.now();
		try {
			const text = (await this._fileService.readFile(resource)).value.toString().slice(0, this._getMaxFileChars());
			const relativePath = this._documentPath(folder.name, relPath);
			this._workspaceSymbolIndexService.updateFileSymbols(relativePath, text);
			const mergeStart = performance.now();
			const core = useCpuWorker
				? await this._indexerCpuWorker.applyIncrementalCore({
					relativePath,
					text,
					semanticIndex: this._semanticIndex,
					astIndex: this._astIndex,
				})
				: applyQuantumIDESemanticIncrementalCore({
					relativePath,
					text,
					semanticIndex: this._semanticIndex,
					astIndex: this._astIndex,
				});
			recordQuantumIDEIndexingMainThreadSlice(performance.now() - mergeStart);
			if (core.semanticIndex) {
				this._semanticIndex = core.semanticIndex;
			}
			if (core.astIndex) {
				this._astIndex = core.astIndex;
			}
			if (this._commentsIndex) {
				const commentSlice = buildCommentsIndex([{ path: relativePath, text }]);
				const kept = this._commentsIndex.entries.filter(e => e.path !== relativePath);
				this._commentsIndex = {
					...this._commentsIndex,
					generatedAt: new Date().toISOString(),
					entries: [...kept, ...commentSlice.entries],
				};
			}
			const durationMs = performance.now() - start;
			recordQuantumIDESemanticIncrementalFileLatency(durationMs);
			assertWithinBudget('semanticIncrementalFile', durationMs, QuantumIDEPerformanceBudgetMs.semanticIncrementalFile);
			this._onDidChangeIndex.fire();
			this._persistIncrementalScheduler.schedule();
			this._logService.trace(formatQuantumIDEWorkspaceDiscoveryLog({
				component: 'indexing-status',
				operation: 'incremental-file',
				durationMs,
				fileCount: this._semanticIndex?.documents.length,
				matchCount: core.symbolCount,
			}) + ` path=${relativePath}`);
		} catch {
			// skip
		}
	}

	getSemanticIndex(): IQuantumIDESemanticIndex | undefined {
		return this._semanticIndex;
	}

	getAstIndex(): IQuantumIDEAstIndex | undefined {
		return this._astIndex;
	}

	getVectorIndex(): IQuantumIDEVectorIndex | undefined {
		return this._vectorIndex;
	}

	getDependencyGraph(): IQuantumIDEDependencyGraph | undefined {
		return this._dependencyGraph;
	}

	getCommentsIndex(): IQuantumIDECommentsIndex | undefined {
		return this._commentsIndex;
	}

	getDiagnosticsIndex(): IQuantumIDEDiagnosticsIndex | undefined {
		return this._diagnosticsIndex;
	}

	async refreshIndexes(reason = 'manual'): Promise<void> {
		if (!this._workspaceTrustManagementService.isWorkspaceTrusted()) {
			return;
		}
		if (this._configurationService.getValue<boolean>(QuantumIDEAISettingId.IndexingEnabled) !== true) {
			return;
		}
		if (this._configurationService.getValue<boolean>(QuantumIDEAISettingId.SemanticIndexingEnabled) !== true
			&& this._configurationService.getValue<string>(QuantumIDEAISettingId.IndexingEmbeddingProvider) === 'disabled') {
			return;
		}
		const folders = this._workspaceContextService.getWorkspace().folders;
		if (folders.length === 0) {
			return;
		}
		await runWithBudget('incrementalIndexing', QuantumIDEPerformanceBudgetMs.incrementalIndexing, async () => {
			beginQuantumIDEIndexingMainThreadSession();
			try {
			markQuantumIDEPerformanceStart(QuantumIDEPerformanceMark.WorkspaceIndexRefresh);
			this._ignoreService.invalidate();
			this._cachedIndexPolicy = undefined;
			const indexIgnorePolicy = await this._warmIndexIgnorePolicy();
			const scale = this._getScaleLimits();
			const documents: { path: string; text: string }[] = [];
			const manifests: { path: string; content: string }[] = [];
			let scanned = 0;
			const perFolderBudget = Math.max(50, Math.floor(scale.maxFiles / Math.max(1, folders.length)));
			for (const folder of folders) {
				const scannedFolder = await collectIndexCandidatesChunked({
					root: folder.uri,
					maxFiles: perFolderBudget,
					maxDepth: scale.maxScanDepth,
					yieldEveryMs: scale.indexYieldMs,
					shouldSkip: relativePath => isQuantumIDEPathIgnored(relativePath, indexIgnorePolicy, 'index'),
					isIndexable: (relativePath, resource) => INDEXABLE_EXT.test(resource.path) || relativePath.endsWith('package.json'),
					listDirectory: async resource => {
						const stat = await this._fileService.resolve(resource);
						return (stat.children ?? []).map(child => ({
							name: child.name,
							resource: child.resource,
							isDirectory: child.isDirectory,
						}));
					},
				}, async batch => {
					for (const candidate of batch) {
						try {
							const text = (await this._fileService.readFile(candidate.resource)).value.toString().slice(0, scale.maxFileChars);
							const scopedPath = this._documentPath(folder.name, candidate.relativePath);
							if (candidate.relativePath.endsWith('package.json')) {
								manifests.push({ path: scopedPath, content: text });
							} else {
								documents.push({ path: scopedPath, text });
							}
						} catch {
							// skip
						}
					}
				});
				scanned += scannedFolder;
			}
			this._semanticIndex = buildSemanticIndex(documents);
			const parser = getDefaultQuantumIDEParserAdapter();
			this._astIndex = buildAstIndex(documents, (path, text, max) => parser.extractSymbols(path, text, max));
			this._commentsIndex = buildCommentsIndex(documents);
			const diagLimit = scale.profile === 'enterprise' ? 20_000 : 5000;
			this._diagnosticsIndex = buildDiagnosticsIndex(this._collectDiagnosticEntries(documents.map(d => d.path), diagLimit));
			await this._workspaceSymbolIndexService.refreshWorkspaceSymbols(this._astIndex.symbols);
			const embeddingProvider = this._configurationService.getValue<string>(QuantumIDEAISettingId.IndexingEmbeddingProvider);
			if (embeddingProvider !== 'disabled') {
				this._vectorIndex = await this._buildVectorIndex(documents, embeddingProvider);
				const vectorStore = this._configurationService.getValue<string>(QuantumIDEAISettingId.IndexingVectorStore) ?? 'json';
				if (vectorStore === 'incremental' || vectorStore === 'lancedb') {
					const embedFn = await this._createEmbedFn(documents, embeddingProvider);
					const manifest = await persistIncrementalVectorStore(this._fileService, folders[0].uri, documents, embeddingProvider, embedFn);
					this._logService.info(formatQuantumIDEIndexingSyncLog({
						phase: 'completed',
						reason: `${reason}-vector-pipeline`,
						indexedFiles: documents.length,
						vectorChunks: manifest.chunkCount,
						embeddingProvider,
						ready: true,
						busy: false,
					}));
				}
			}
			this._dependencyGraph = buildDependencyGraph(
				manifests,
				documents.map(doc => ({ path: doc.path, content: doc.text })),
			);
			await this._persistGitMetadata(folders[0].uri);
			await this._persistIndexes(folders[0].uri);
			setQuantumIDEIncrementalVectorStoreAdapter(this._fileService, folders[0].uri);
			this._onDidChangeIndex.fire();
			const tsAst = this._astIndex?.treeSitterSymbolCount ?? 0;
			this._logService.info(`[QuantumIDE] Indexes refreshed (${reason}, ${scale.profile}): ${scanned} scanned, ${documents.length} docs, ${manifests.length} manifests, ${tsAst} Tree-sitter AST symbols`);
			const elapsed = markQuantumIDEPerformanceEnd(QuantumIDEPerformanceMark.WorkspaceIndexRefresh) ?? 0;
			assertWithinBudget('incrementalIndexing', elapsed, QuantumIDEPerformanceBudgetMs.incrementalIndexing);
			} finally {
				endQuantumIDEIndexingMainThreadSession();
			}
		});
	}

	async searchSemantic(query: string, maxResults = 20): Promise<readonly { path: string; score: number }[]> {
		return runWithBudget('semanticRetrieval', QuantumIDEPerformanceBudgetMs.semanticRetrieval, async () => {
			markQuantumIDEPerformanceStart(QuantumIDEPerformanceMark.SemanticSearch);
			if (!this._semanticIndex) {
				await this.refreshIndexes('search on demand');
			}
			const results = this._semanticIndex ? searchSemanticIndex(this._semanticIndex, query, maxResults) : [];
			markQuantumIDEPerformanceEnd(QuantumIDEPerformanceMark.SemanticSearch);
			return results;
		});
	}

	async searchVector(query: string, maxResults = 20): Promise<readonly { path: string; score: number }[]> {
		return runWithBudget('semanticRetrieval', QuantumIDEPerformanceBudgetMs.semanticRetrieval, async () => {
			const folder = this._workspaceContextService.getWorkspace().folders[0];
			const vectorStore = this._configurationService.getValue<string>(QuantumIDEAISettingId.IndexingVectorStore) ?? 'json';
			if (folder && (vectorStore === 'incremental' || vectorStore === 'lancedb')) {
				const hits = await loadIncrementalVectorSearch(this._fileService, folder.uri, query, maxResults);
				if (hits.length > 0) {
					return hits;
				}
			}
			if (!this._vectorIndex) {
				await this.refreshIndexes('vector search on demand');
			}
			return this._vectorIndex
				? getDefaultQuantumIDEVectorStoreAdapter().search(this._vectorIndex, query, maxResults)
				: [];
		});
	}

	async searchComments(query: string, maxResults = 20): Promise<readonly { path: string; line: number; text: string; kind: string }[]> {
		if (!this._commentsIndex) {
			await this.refreshIndexes('comments search on demand');
		}
		return (this._commentsIndex ? searchCommentsIndex(this._commentsIndex, query, maxResults) : []).map(e => ({
			path: e.path,
			line: e.line,
			text: e.text,
			kind: e.kind,
		}));
	}

	async searchDiagnostics(query: string, maxResults = 20): Promise<readonly { path: string; line: number; message: string; severity: string }[]> {
		if (!this._diagnosticsIndex) {
			await this.refreshIndexes('diagnostics search on demand');
		}
		return (this._diagnosticsIndex ? searchDiagnosticsIndex(this._diagnosticsIndex, query, maxResults) : []).map(e => ({
			path: e.path,
			line: e.line,
			message: e.message,
			severity: e.severity,
		}));
	}

	getIndexStats(): { indexedFiles: number; vectorChunks: number } {
		const semantic = this._semanticIndex;
		const vector = this._vectorIndex;
		return {
			indexedFiles: semantic?.documents.length ?? 0,
			vectorChunks: vector?.documents.length ?? 0,
		};
	}

	async inspectCache(): Promise<string> {
		const policy = await this._ignoreService.getPolicy();
		const semantic = this._semanticIndex;
		const ast = this._astIndex;
		const vector = this._vectorIndex;
		const graph = this._dependencyGraph;
		return [
			'QuantumIDE index cache',
			semantic ? `Semantic: ${semantic.documents.length} documents, ${Object.keys(semantic.idf).length} terms (${semantic.generatedAt})` : 'Semantic: not built',
			ast ? `AST: ${ast.symbols.length} symbols (${ast.generatedAt})` : 'AST: not built',
			vector ? `Vector: ${vector.documents.length} documents, dim ${vector.dim} (${vector.generatedAt})` : 'Vector: not built',
			this._commentsIndex ? `Comments: ${this._commentsIndex.entries.length} entries (${this._commentsIndex.generatedAt})` : 'Comments: not built',
			this._diagnosticsIndex ? `Diagnostics: ${this._diagnosticsIndex.entries.length} entries (${this._diagnosticsIndex.generatedAt})` : 'Diagnostics: not built',
			graph ? `Dependency graph: ${graph.nodes.length} nodes (${graph.generatedAt})` : 'Dependency graph: not built',
			`Ignore policy: ${policy.aiPatterns.length} AI + ${policy.indexingOnlyPatterns.length} index-only pattern(s)`,
			`Scale profile: ${this._getScaleLimits().profile} (max ${this._getScaleLimits().maxFiles} files)`,
			`Vector store: ${this._configurationService.getValue<string>(QuantumIDEAISettingId.IndexingVectorStore) ?? 'json'}`,
		].join('\n');
	}

	async clearIndexCache(): Promise<void> {
		const folder = this._workspaceContextService.getWorkspace().folders[0];
		this._semanticIndex = undefined;
		this._astIndex = undefined;
		this._vectorIndex = undefined;
		this._dependencyGraph = undefined;
		this._commentsIndex = undefined;
		this._diagnosticsIndex = undefined;
		if (!folder) {
			this._onDidChangeIndex.fire();
			return;
		}
		const cacheFiles = [
			QUANTUMIDE_SEMANTIC_INDEX_FILE,
			QUANTUMIDE_AST_INDEX_FILE,
			QUANTUMIDE_VECTOR_INDEX_FILE,
			QUANTUMIDE_DEPENDENCY_GRAPH_FILE,
			QUANTUMIDE_COMMENTS_INDEX_FILE,
			QUANTUMIDE_DIAGNOSTICS_INDEX_FILE,
		];
		try {
			await this._fileService.del(joinPath(folder.uri, QUANTUMIDE_VECTOR_STORE_DIR), { recursive: true });
		} catch {
			// ignore
		}
		for (const relativePath of cacheFiles) {
			try {
				await this._fileService.del(joinPath(folder.uri, relativePath));
			} catch {
				// ignore missing files
			}
		}
		this._onDidChangeIndex.fire();
		this._logService.info('[QuantumIDE] Index cache cleared');
	}

	private _workspaceCacheKey(): string {
		return this._workspaceContextService.getWorkspace().folders[0]?.uri.fsPath ?? 'quantumide-default';
	}

	private _shouldEncryptCache(): boolean {
		return this._configurationService.getValue<boolean>(QuantumIDEAISettingId.PrivacyEncryptIndexCache) === true;
	}

	private _encodeCachePayload(text: string): string {
		return this._shouldEncryptCache() ? encryptQuantumIDEIndexPayload(text, this._workspaceCacheKey()) : text;
	}

	private _decodeCachePayload(text: string): string {
		return isEncryptedQuantumIDEIndexPayload(text) ? decryptQuantumIDEIndexPayload(text, this._workspaceCacheKey()) : text;
	}

	private _getScaleLimits() {
		return resolveQuantumIDEIndexScaleLimits(
			this._configurationService.getValue<string>(QuantumIDEAISettingId.IndexingScaleProfile),
			this._configurationService.getValue<number>(QuantumIDEAISettingId.IndexingMaxFiles),
			this._configurationService.getValue<number>(QuantumIDEAISettingId.IndexingMaxFileChars),
		);
	}

	private _getMaxFileChars(): number {
		return this._getScaleLimits().maxFileChars;
	}

	private _collectDiagnosticEntries(paths: readonly string[], maxEntries = 5000): IQuantumIDEDiagnosticIndexEntry[] {
		const entries: IQuantumIDEDiagnosticIndexEntry[] = [];
		for (const path of paths) {
			const resource = this._resolveDocumentUri(path);
			if (!resource) {
				continue;
			}
			for (const marker of this._markerService.read({ resource })) {
				entries.push({
					path,
					line: marker.startLineNumber,
					message: marker.message,
					severity: markerSeverityToIndex(marker.severity),
					source: marker.source,
					code: typeof marker.code === 'string' ? marker.code : marker.code?.value,
				});
			}
		}
		return entries.slice(0, maxEntries);
	}

	private _documentPath(folderName: string, relativePath: string): string {
		const normalized = relativePath.replace(/\\/g, '/').replace(/^\.\//, '');
		return `${folderName}/${normalized}`;
	}

	private _resolveDocumentUri(scopedPath: string): URI | undefined {
		const [folderName, ...rest] = scopedPath.split('/');
		if (!folderName || rest.length === 0) {
			return undefined;
		}
		const folder = this._workspaceContextService.getWorkspace().folders.find(f => f.name === folderName);
		if (!folder) {
			return undefined;
		}
		return joinPath(folder.uri, rest.join('/'));
	}

	private async _createEmbedFn(documents: { path: string; text: string }[], provider: string): Promise<(text: string) => Float32Array> {
		if (provider === 'openai') {
			const apiKey = await this._secretStorageService.get(QuantumIDEOpenAIApiKeySecretStorageKey);
			const baseUrl = this._configurationService.getValue<string>(QuantumIDEAISettingId.OpenAIBaseUrl) ?? 'https://api.openai.com/v1';
			if (apiKey && documents.length > 0) {
				try {
					const vectors = await fetchOpenAIEmbeddings({ apiKey, baseUrl, texts: documents.map(d => d.text) });
					if (vectors.length === documents.length) {
						const cache = new Map<string, Float32Array>();
						for (let i = 0; i < documents.length; i++) {
							cache.set(documents[i].text, vectors[i]);
						}
						return (text: string) => cache.get(text) ?? embedText(text);
					}
				} catch (err) {
					this._logService.warn('[QuantumIDE] OpenAI batch embeddings failed; using local vectors', err);
				}
			}
		}
		return (text: string) => embedText(text);
	}

	private async _buildVectorIndex(documents: { path: string; text: string }[], provider: string): Promise<IQuantumIDEVectorIndex> {
		const embedFn = await this._createEmbedFn(documents, provider);
		const sample = documents[0] ? embedFn(documents[0].text) : embedText('');
		return {
			version: 1,
			generatedAt: new Date().toISOString(),
			dim: sample.length,
			documents: documents.map(doc => ({ path: doc.path, vector: embedFn(doc.text) })),
		};
	}

	private async _persistGitMetadata(root: URI): Promise<void> {
		const graph = await this._quantumIDEWorkspaceContextService.getWorkspaceGraph();
		const payload = {
			version: 2,
			generatedAt: new Date().toISOString(),
			projects: graph?.projects.length ?? 0,
			manifests: graph?.manifests.length ?? 0,
			files: graph?.files.length ?? 0,
			projectNames: graph?.projects.map(p => p.name).slice(0, 50) ?? [],
			manifestPaths: graph?.manifests.map(m => m.workspaceRelativePath).slice(0, 100) ?? [],
		};
		await this._fileService.writeFile(
			joinPath(root, QUANTUMIDE_GIT_INDEX_FILE),
			VSBuffer.fromString(this._encodeCachePayload(JSON.stringify(payload, undefined, 2))),
		);
	}

	private async _persistSemanticShards(root: URI, index: import('../../../../platform/quantumide/common/quantumideSemanticIndex.js').IQuantumIDESemanticIndex): Promise<void> {
		const shardDir = joinPath(root, QUANTUMIDE_SEMANTIC_SHARD_DIR);
		await this._fileService.createFolder(shardDir);
		const shards = shardSemanticDocuments(index.documents);
		const meta = buildSemanticShardMeta(index);
		await this._fileService.writeFile(
			joinPath(shardDir, 'meta.json'),
			VSBuffer.fromString(this._encodeCachePayload(JSON.stringify(meta, undefined, 2))),
		);
		for (let i = 0; i < shards.length; i++) {
			await this._fileService.writeFile(
				joinPath(shardDir, semanticShardFileName(i)),
				VSBuffer.fromString(this._encodeCachePayload(JSON.stringify(shards[i], undefined, 2))),
			);
		}
		await this._fileService.writeFile(
			joinPath(root, QUANTUMIDE_SEMANTIC_INDEX_FILE),
			VSBuffer.fromString(this._encodeCachePayload(JSON.stringify(index, undefined, 2))),
		);
	}

	private async _loadStoredIndexes(): Promise<void> {
		const folder = this._workspaceContextService.getWorkspace().folders[0];
		if (!folder) {
			return;
		}
		try {
			const semanticRaw = this._decodeCachePayload((await this._fileService.readFile(joinPath(folder.uri, QUANTUMIDE_SEMANTIC_INDEX_FILE))).value.toString());
			this._semanticIndex = parseSemanticIndexJson(semanticRaw);
		} catch {
			try {
				const metaRaw = this._decodeCachePayload((await this._fileService.readFile(joinPath(folder.uri, QUANTUMIDE_SEMANTIC_SHARD_DIR, 'meta.json'))).value.toString());
				const meta = JSON.parse(metaRaw) as IQuantumIDESemanticShardMeta;
				if (meta?.version === 1) {
					const shardDocs: import('../../../../platform/quantumide/common/quantumideSemanticIndex.js').IQuantumIDESemanticDocument[][] = [];
					for (let i = 0; i < meta.shardCount; i++) {
						const shardRaw = this._decodeCachePayload((await this._fileService.readFile(joinPath(folder.uri, QUANTUMIDE_SEMANTIC_SHARD_DIR, semanticShardFileName(i)))).value.toString());
						shardDocs.push(JSON.parse(shardRaw));
					}
					this._semanticIndex = mergeSemanticShards(meta, shardDocs);
				}
			} catch {
				// ignore
			}
		}
		try {
			const commentsRaw = this._decodeCachePayload((await this._fileService.readFile(joinPath(folder.uri, QUANTUMIDE_COMMENTS_INDEX_FILE))).value.toString());
			this._commentsIndex = parseCommentsIndexJson(commentsRaw);
		} catch {
			// ignore
		}
		try {
			const diagnosticsRaw = this._decodeCachePayload((await this._fileService.readFile(joinPath(folder.uri, QUANTUMIDE_DIAGNOSTICS_INDEX_FILE))).value.toString());
			this._diagnosticsIndex = parseDiagnosticsIndexJson(diagnosticsRaw);
		} catch {
			// ignore
		}
		try {
			const astRaw = this._decodeCachePayload((await this._fileService.readFile(joinPath(folder.uri, QUANTUMIDE_AST_INDEX_FILE))).value.toString());
			this._astIndex = parseAstIndexJson(astRaw);
		} catch {
			// ignore
		}
		try {
			const vectorRaw = this._decodeCachePayload((await this._fileService.readFile(joinPath(folder.uri, QUANTUMIDE_VECTOR_INDEX_FILE))).value.toString());
			this._vectorIndex = parseVectorIndexJson(vectorRaw);
		} catch {
			// ignore
		}
		try {
			const graphRaw = this._decodeCachePayload((await this._fileService.readFile(joinPath(folder.uri, QUANTUMIDE_DEPENDENCY_GRAPH_FILE))).value.toString());
			const parsed = JSON.parse(graphRaw) as IQuantumIDEDependencyGraph;
			if (parsed?.version === 1) {
				this._dependencyGraph = parsed;
			}
		} catch {
			// ignore
		}
	}

	private async _persistIndexes(root: URI): Promise<void> {
		await this._fileService.createFolder(joinPath(root, '.quantumide'));
		if (this._semanticIndex) {
			await this._persistSemanticShards(root, this._semanticIndex);
		}
		if (this._commentsIndex) {
			await this._fileService.writeFile(
				joinPath(root, QUANTUMIDE_COMMENTS_INDEX_FILE),
				VSBuffer.fromString(this._encodeCachePayload(JSON.stringify(this._commentsIndex, undefined, 2))),
			);
		}
		if (this._diagnosticsIndex) {
			await this._fileService.writeFile(
				joinPath(root, QUANTUMIDE_DIAGNOSTICS_INDEX_FILE),
				VSBuffer.fromString(this._encodeCachePayload(JSON.stringify(this._diagnosticsIndex, undefined, 2))),
			);
		}
		if (this._astIndex) {
			await this._fileService.writeFile(
				joinPath(root, QUANTUMIDE_AST_INDEX_FILE),
				VSBuffer.fromString(this._encodeCachePayload(JSON.stringify(this._astIndex, undefined, 2))),
			);
		}
		if (this._vectorIndex) {
			const vectorStore = this._configurationService.getValue<string>(QuantumIDEAISettingId.IndexingVectorStore) ?? 'json';
			if (vectorStore === 'json') {
				await this._fileService.writeFile(
					joinPath(root, QUANTUMIDE_VECTOR_INDEX_FILE),
					VSBuffer.fromString(this._encodeCachePayload(serializeVectorIndex(this._vectorIndex))),
				);
			}
		}
		if (this._dependencyGraph) {
			await this._fileService.writeFile(
				joinPath(root, QUANTUMIDE_DEPENDENCY_GRAPH_FILE),
				VSBuffer.fromString(this._encodeCachePayload(JSON.stringify(this._dependencyGraph, undefined, 2))),
			);
		}
	}
}

function markerSeverityToIndex(severity: MarkerSeverity): IQuantumIDEDiagnosticIndexEntry['severity'] {
	switch (severity) {
		case MarkerSeverity.Error: return 'error';
		case MarkerSeverity.Warning: return 'warning';
		case MarkerSeverity.Info: return 'info';
		default: return 'hint';
	}
}

registerSingleton(IQuantumIDESemanticIndexService, QuantumIDESemanticIndexService, InstantiationType.Delayed);
