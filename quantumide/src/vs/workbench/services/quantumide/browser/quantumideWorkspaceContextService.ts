/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { basename, extname } from '../../../../base/common/path.js';
import { joinPath, relativePath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { Range } from '../../../../editor/common/core/range.js';
import { MarkerSeverity } from '../../../../platform/markers/common/markers.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { FileChangesEvent, IFileService, type IFileStat } from '../../../../platform/files/common/files.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IMarkerService } from '../../../../platform/markers/common/markers.js';
import {
	computeQuantumIDELiteGraphEffectiveMaxFiles,
	computeQuantumIDELiteGraphPerRootBudget,
	QUANTUMIDE_LITE_GRAPH_MAX_DEPTH,
	QUANTUMIDE_LITE_GRAPH_MAX_FILES,
} from '../../../../platform/quantumide/common/quantumideLiteGraphValidation.js';
import {
	computeQuantumIDEMultiRootScanConcurrency,
	runQuantumIDERootScansInParallel,
} from '../../../../platform/quantumide/common/quantumideParallelRootScan.js';
import {
	formatQuantumIDEWorkspaceTrustWarningForContext,
	isQuantumIDEWorkspaceGraphUntrusted,
	QUANTUMIDE_WORKSPACE_UNTRUSTED_REASON,
} from '../../../../platform/quantumide/common/quantumideWorkspaceTrust.js';
import { QUANTUMIDE_AI_WORKSPACE_INDEX_STORAGE_KEY, QuantumIDEManifestKind, QuantumIDEWorkspaceIndexExcludeNames, createEmptyQuantumIDEWorkspaceGraph, detectQuantumIDEManifestKind, getQuantumIDEManifestEcosystem, summarizeQuantumIDEWorkspaceGraph, type IQuantumIDEFileNode, type IQuantumIDEManifestNode, type IQuantumIDEProjectNode, type IQuantumIDEWorkspaceFolderNode, type IQuantumIDEWorkspaceGraph, type IQuantumIDEWorkspaceRootScanSummary } from '../../../../platform/quantumide/common/quantumideWorkspaceGraph.js';
import { QuantumIDEAISettingId } from '../../../../platform/quantumide/common/quantumideAISettings.js';
import { StorageScope, StorageTarget, IStorageService } from '../../../../platform/storage/common/storage.js';
import { IWorkspaceTrustManagementService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { IWorkspaceContextService, type IWorkspaceFolder } from '../../../../platform/workspace/common/workspace.js';
import { ISCMService } from '../../../contrib/scm/common/scm.js';
import { collectAgentSearchRoots, formatWorkspaceFolderLinks } from '../../../../platform/quantumide/common/quantumideWorkspaceRoots.js';
import {
	isQuantumIDEPathIgnored,
	type IQuantumIDEWorkspaceIgnorePolicy,
} from '../../../../platform/quantumide/common/quantumideWorkspaceIgnore.js';
import { mergeQuantumIDEIndexingExcludePatterns } from '../../../../platform/quantumide/common/quantumideIndexingExcludePatterns.js';
import { loadQuantumIDEWorkspaceIgnorePolicy } from '../../../../platform/quantumide/common/quantumideWorkspaceIgnoreLoader.js';
import { formatQuantumIDEWorkspaceDiscoveryLog } from '../../../../platform/quantumide/common/quantumideWorkspaceDiscoveryLog.js';
import { clipQuantumIDEUtf16Safe } from '../../../../platform/quantumide/common/quantumideUtf16Clip.js';
import {
	buildQuantumIDEAtMentionPathsFromGraph,
} from '../../../../platform/quantumide/common/quantumideAtMentionPathCache.js';
import {
	bumpQuantumIDEWorkspaceGraphGeneration,
	getQuantumIDEWorkspaceGraphGeneration,
	setQuantumIDEMemoryBudgetMb,
} from '../../../../platform/quantumide/common/quantumideWorkspacePerformanceCoordinator.js';
import {
	buildQuantumIDEWorkspaceGraphContextAttachment,
	getQuantumIDEWorkspaceGraphContextAttachState,
	setQuantumIDEWorkspaceGraphContextAttachState,
} from '../../../../platform/quantumide/common/quantumideWorkspaceGraphContextAttachment.js';
import {
	acquireQuantumIDEWorkspaceGraphFullRefresh,
	releaseQuantumIDEWorkspaceGraphFullRefresh,
	releaseQuantumIDEWorkspaceGraphIncrementalPatch,
	shouldCommitQuantumIDEWorkspaceGraphIncrementalPatch,
	tryAcquireQuantumIDEWorkspaceGraphIncrementalPatch,
} from '../../../../platform/quantumide/common/quantumideWorkspaceGraphRefreshCoordinator.js';
import { QUANTUMIDE_DEFAULT_MEMORY_BUDGET_MB } from '../../../../platform/quantumide/common/quantumideWorkspaceMemoryBudget.js';
import {
	buildQuantumIDEWorkspaceGraphStructureIndexFromGraph,
	createQuantumIDEStructureIndexSnapshot,
	QUANTUMIDE_STRUCTURE_INDEX_FILE,
	type IQuantumIDEWorkspaceGraphStructureIndex,
} from '../../../../platform/quantumide/common/quantumideWorkspaceGraphStructureIndex.js';
import {
	buildQuantumIDEWorkspaceAgentSnapshot,
	QUANTUMIDE_AGENT_SNAPSHOT_FILE,
	serializeQuantumIDEWorkspaceAgentSnapshot,
} from '../../../../platform/quantumide/common/quantumideWorkspaceSnapshotBridge.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import {
	recordQuantumIDEWatcherGraphVisibilityMs,
	recordQuantumIDEWorkspaceGraphFullRescan,
	recordQuantumIDEWorkspaceGraphIncrementalPatch,
} from '../../../../platform/quantumide/common/quantumideWorkspaceDiscoveryTelemetry.js';
import {
	computeQuantumIDEWatcherGraphVisibilityMs,
	planWorkspaceGraphFileWatcherRefresh,
	QUANTUMIDE_FILE_WATCHER_FULL_REFRESH_DEBOUNCE_MS,
	QUANTUMIDE_FILE_WATCHER_INCREMENTAL_DEBOUNCE_MS,
	QUANTUMIDE_FILE_WATCHER_MAX_INCREMENTAL_CHANGES,
} from '../../../../platform/quantumide/common/quantumideWorkspaceGraphWatcher.js';
import { IQuantumIDEWorkspaceContextBuildOptions, IQuantumIDEWorkspaceContextService } from '../common/quantumideWorkspaceContext.js';

const MAX_SCAN_DEPTH = 6;
const MAX_LITE_SCAN_DEPTH = QUANTUMIDE_LITE_GRAPH_MAX_DEPTH;
const MAX_LITE_INDEX_FILES = QUANTUMIDE_LITE_GRAPH_MAX_FILES;
const MIN_INDEX_FILES = 100;
const MAX_INDEX_FILES = 1_000;
const MAX_CONTEXT_CHARS = 14_000;
const MAX_DIAGNOSTICS_IN_CONTEXT = 12;
const MAX_SCM_RESOURCES_IN_CONTEXT = 30;

interface IQuantumIDEScanState {
	readonly workspaceFolder: IWorkspaceFolder;
	readonly rootRelativePrefix: string;
	readonly files: IQuantumIDEFileNode[];
	readonly manifests: IQuantumIDEManifestNode[];
	readonly projectsByRoot: Map<string, {
		readonly rootUri: string;
		readonly workspaceRelativePath: string;
		readonly manifestKinds: Set<QuantumIDEManifestKind>;
		readonly frameworks: Set<string>;
	}>;
	visited: number;
	truncated: boolean;
	ignoredPathCount: number;
}

interface IQuantumIDELiteRootScanResult {
	readonly folderName: string;
	readonly files: IQuantumIDEFileNode[];
	readonly manifests: IQuantumIDEManifestNode[];
	readonly projectsByRoot: IQuantumIDEScanState['projectsByRoot'];
	readonly truncated: boolean;
	readonly filesIndexed: number;
}

export class QuantumIDEWorkspaceContextService extends Disposable implements IQuantumIDEWorkspaceContextService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeGraph = this._register(new Emitter<IQuantumIDEWorkspaceGraph>());
	readonly onDidChangeGraph = this._onDidChangeGraph.event;

	private readonly _refreshScheduler = this._register(new RunOnceScheduler(() => {
		void this.refreshWorkspaceGraph('workspace change');
	}, 1_500));

	private readonly _fileWatcherRefreshScheduler = this._register(new RunOnceScheduler(() => {
		void this.refreshWorkspaceGraph('file watcher debounced');
	}, QUANTUMIDE_FILE_WATCHER_FULL_REFRESH_DEBOUNCE_MS));

	private readonly _incrementalScheduler = this._register(new RunOnceScheduler(() => {
		void this._runIncrementalGraphPatch();
	}, QUANTUMIDE_FILE_WATCHER_INCREMENTAL_DEBOUNCE_MS));

	private _graph: IQuantumIDEWorkspaceGraph | undefined;
	private _structureIndex: IQuantumIDEWorkspaceGraphStructureIndex | undefined;
	private _cachedAtMentionPaths: readonly string[] = [];
	private _refreshPromise: Promise<IQuantumIDEWorkspaceGraph> | undefined;
	private _ignorePolicy: IQuantumIDEWorkspaceIgnorePolicy | undefined;
	private _scanRotation = 0;
	private readonly _pendingWatcherAdded: URI[] = [];
	private readonly _pendingWatcherUpdated: URI[] = [];
	private readonly _pendingWatcherDeleted: URI[] = [];

	constructor(
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IFileService private readonly _fileService: IFileService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IStorageService private readonly _storageService: IStorageService,
		@IWorkspaceTrustManagementService private readonly _workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@ICodeEditorService private readonly _codeEditorService: ICodeEditorService,
		@IMarkerService private readonly _markerService: IMarkerService,
		@ISCMService private readonly _scmService: ISCMService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._applyMemoryBudgetFromConfig();
		this._graph = this._readStoredGraph();
		if (this._graph) {
			this._graph = {
				...this._graph,
				status: {
					...this._graph.status,
					reason: this._graph.status.reason ?? 'hydrated from storage (pre-lite-scan)',
				},
			};
		}
		this._structureIndex = buildQuantumIDEWorkspaceGraphStructureIndexFromGraph(this._graph);
		this._rebuildCachedAtMentionPaths();
		this._register(this._workspaceContextService.onDidChangeWorkspaceFolders(() => {
			this._ignorePolicy = undefined;
			this._logService.debug(formatQuantumIDEWorkspaceDiscoveryLog({
				component: 'workspace-graph',
				operation: 'workspace-folders-changed',
				fileCount: this._workspaceContextService.getWorkspace().folders.length,
			}));
			this._refreshScheduler.schedule();
		}));
		this._register(this._fileService.onDidFilesChange(e => {
			this._accumulateFileWatcherChanges(e);
			this._scheduleFileWatcherGraphRefresh();
		}));
		this._register(this._workspaceTrustManagementService.onDidChangeTrust(() => this._refreshScheduler.schedule()));
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(QuantumIDEAISettingId.MemoryBudgetMb)) {
				this._applyMemoryBudgetFromConfig();
			}
			if (e.affectsConfiguration(QuantumIDEAISettingId.IndexingExcludePatterns)
				|| e.affectsConfiguration(QuantumIDEAISettingId.IndexingIgnoreFile)
				|| e.affectsConfiguration(QuantumIDEAISettingId.IndexingEnabled)) {
				this._ignorePolicy = undefined;
				this._refreshScheduler.schedule();
			}
		}));
		// Defer first scan so opening a .code-workspace file can render the shell before indexing.
		// Multi-root workspaces (§11): schedule sooner so lite graph is ready within ~10s.
		const folderCount = this._workspaceContextService.getWorkspace().folders.length;
		const initialDeferMs = folderCount >= 5 ? 2_000 : folderCount >= 2 ? 4_000 : 8_000;
		this._register(new RunOnceScheduler(() => {
			this._refreshScheduler.schedule();
		}, initialDeferMs)).schedule();
		if (folderCount >= 5 && this._workspaceTrustManagementService.isWorkspaceTrusted()) {
			queueMicrotask(() => {
				void this.refreshWorkspaceGraph('multi-root lite prefetch');
			});
		}
	}

	getWorkspaceGraph(): IQuantumIDEWorkspaceGraph | undefined {
		return this._graph;
	}

	getWorkspaceStructureIndex(): IQuantumIDEWorkspaceGraphStructureIndex | undefined {
		return this._structureIndex;
	}

	getCachedAtMentionPaths(): readonly string[] {
		return this._cachedAtMentionPaths;
	}

	rebuildCachedAtMentionPaths(policy?: IQuantumIDEWorkspaceIgnorePolicy): void {
		this._rebuildCachedAtMentionPaths(policy);
	}

	private _applyMemoryBudgetFromConfig(): void {
		const configured = this._configurationService.getValue<number>(QuantumIDEAISettingId.MemoryBudgetMb);
		setQuantumIDEMemoryBudgetMb(configured ?? QUANTUMIDE_DEFAULT_MEMORY_BUDGET_MB);
	}

	private _rebuildCachedAtMentionPaths(policy?: IQuantumIDEWorkspaceIgnorePolicy): void {
		const paths = buildQuantumIDEAtMentionPathsFromGraph(this._graph, policy);
		const bump = bumpQuantumIDEWorkspaceGraphGeneration(paths);
		this._cachedAtMentionPaths = paths;
		this._logService.trace(formatQuantumIDEWorkspaceDiscoveryLog({
			component: 'workspace-graph',
			operation: 'graph-generation-bump',
			fileCount: paths.length,
			durationMs: bump.clearDurationMs,
		}));
	}

	async refreshWorkspaceGraph(reason = 'manual'): Promise<IQuantumIDEWorkspaceGraph> {
		if (this._refreshPromise) {
			return this._refreshPromise;
		}
		this._incrementalScheduler.cancel();
		this._refreshPromise = (async () => {
			const lease = acquireQuantumIDEWorkspaceGraphFullRefresh(getQuantumIDEWorkspaceGraphGeneration());
			try {
				return await this._doRefreshWorkspaceGraph(reason);
			} finally {
				releaseQuantumIDEWorkspaceGraphFullRefresh(lease);
			}
		})().finally(() => {
			this._refreshPromise = undefined;
		});
		return this._refreshPromise;
	}

	async buildWorkspaceContext(options: IQuantumIDEWorkspaceContextBuildOptions = {}): Promise<string> {
		const maxChars = options.maxChars ?? MAX_CONTEXT_CHARS;
		const folders = this._getWorkspaceFolders();
		let graph = this._graph;
		if ((!graph || graph.files.length === 0) && folders.length > 0) {
			graph = await this.refreshWorkspaceGraph('context build');
		}
		graph ??= createEmptyQuantumIDEWorkspaceGraph(this._workspaceContextService.getWorkspace().id, folders, 'Workspace graph has not been built yet.');

		const indexingEnabled = this._configurationService.getValue<boolean>(QuantumIDEAISettingId.IndexingEnabled) === true;
		const generation = getQuantumIDEWorkspaceGraphGeneration();
		const graphAttachment = buildQuantumIDEWorkspaceGraphContextAttachment({
			graph,
			generation,
			lastAttached: getQuantumIDEWorkspaceGraphContextAttachState(graph.workspaceId),
			indexingEnabled,
			splitRoots: false,
			maxChars,
			maxFiles: this._getMaxContextFiles(),
		});
		setQuantumIDEWorkspaceGraphContextAttachState(graph.workspaceId, {
			generation: graphAttachment.generation,
			fingerprint: graphAttachment.fingerprint,
			mode: graphAttachment.mode,
		});
		const sections: string[] = [graphAttachment.primary];
		if (isQuantumIDEWorkspaceGraphUntrusted(graph)) {
			sections.push('', formatQuantumIDEWorkspaceTrustWarningForContext());
		}

		if (options.includeActiveEditor !== false) {
			sections.push('', 'Active editor:', this._buildActiveEditorContext());
		}
		if (options.includeDiagnostics !== false) {
			sections.push('', 'Diagnostics:', this._buildDiagnosticsContext());
		}
		if (options.includeSCM !== false) {
			sections.push('', 'SCM changed resources:', this._buildSCMContext());
		}

		return this._clip(sections.join('\n'), maxChars);
	}

	async buildWorkspaceContextByRoot(options: IQuantumIDEWorkspaceContextBuildOptions = {}): Promise<{ primary: string; secondary?: string }> {
		const prefer = options.preferRootFolderName ?? this._getActiveRootFolderName();
		const maxChars = options.maxChars ?? MAX_CONTEXT_CHARS;
		const folders = this._getWorkspaceFolders();
		let graph = this._graph;
		if ((!graph || graph.files.length === 0) && folders.length > 0) {
			graph = await this.refreshWorkspaceGraph('context build');
		}
		graph ??= createEmptyQuantumIDEWorkspaceGraph(this._workspaceContextService.getWorkspace().id, folders, 'Workspace graph has not been built yet.');
		const indexingEnabled = this._configurationService.getValue<boolean>(QuantumIDEAISettingId.IndexingEnabled) === true;
		const generation = getQuantumIDEWorkspaceGraphGeneration();
		const attachment = buildQuantumIDEWorkspaceGraphContextAttachment({
			graph,
			generation,
			lastAttached: getQuantumIDEWorkspaceGraphContextAttachState(graph.workspaceId),
			indexingEnabled,
			preferRoot: prefer,
			splitRoots: !!(prefer && options.splitRootsForRanking !== false),
			maxChars,
			maxFiles: this._getMaxContextFiles(),
		});
		setQuantumIDEWorkspaceGraphContextAttachState(graph.workspaceId, {
			generation: attachment.generation,
			fingerprint: attachment.fingerprint,
			mode: attachment.mode,
		});
		this._logService.info(formatQuantumIDEWorkspaceDiscoveryLog({
			component: 'workspace-context',
			operation: 'graph-context-attach',
			fileCount: graph.files.length,
			fallback: attachment.mode,
		}));
		return { primary: attachment.primary, secondary: attachment.secondary };
	}

	private _getActiveRootFolderName(): string | undefined {
		const uri = this._codeEditorService.getActiveCodeEditor()?.getModel()?.uri;
		if (!uri) {
			return undefined;
		}
		const folder = this._workspaceContextService.getWorkspaceFolder(uri);
		return folder?.name;
	}

	private async _doRefreshWorkspaceGraph(reason: string): Promise<IQuantumIDEWorkspaceGraph> {
		this._ignorePolicy = undefined;
		const workspace = this._workspaceContextService.getWorkspace();
		const folders = this._getWorkspaceFolders();
		if (folders.length === 0) {
			const graph = createEmptyQuantumIDEWorkspaceGraph(workspace.id, folders, 'No workspace folder is open.');
			this._storeGraph(graph);
			return graph;
		}
		if (!this._workspaceTrustManagementService.isWorkspaceTrusted()) {
			const graph = createEmptyQuantumIDEWorkspaceGraph(workspace.id, folders, QUANTUMIDE_WORKSPACE_UNTRUSTED_REASON);
			this._storeGraph(graph);
			this._logService.info(formatQuantumIDEWorkspaceDiscoveryLog({
				component: 'workspace-graph',
				operation: 'refresh-untrusted',
				fileCount: 0,
			}));
			return graph;
		}
		if (this._configurationService.getValue<boolean>(QuantumIDEAISettingId.IndexingEnabled) !== true) {
			return this._buildLiteWorkspaceGraph(workspace.id, folders, reason);
		}

		const maxFiles = this._getMaxIndexFiles();
		const files: IQuantumIDEFileNode[] = [];
		const manifests: IQuantumIDEManifestNode[] = [];
		const projectsByRoot = new Map<string, IQuantumIDEScanState['projectsByRoot'] extends Map<string, infer T> ? T : never>();
		let truncated = false;

		const policy = await this._ensureIgnorePolicy();
		const excludedNames = policy.excludedDirectoryNames;
		const perFolderBudget = Math.max(10, Math.floor(maxFiles / Math.max(1, workspace.folders.length)));
		const perRoot: IQuantumIDEWorkspaceRootScanSummary[] = [];
		const rotated = this._rotatedWorkspaceFolders(workspace.folders);
		const refreshStart = Date.now();
		let totalIgnored = 0;
		for (const folder of rotated) {
			if (files.length >= maxFiles) {
				truncated = true;
				perRoot.push({ folderName: folder.name, filesIndexed: 0, truncated: true });
				continue;
			}
			const countBefore = files.length;
			const folderLimit = Math.min(maxFiles, files.length + perFolderBudget);
			const state: IQuantumIDEScanState = {
				workspaceFolder: folder,
				rootRelativePrefix: folder.name,
				files,
				manifests,
				projectsByRoot,
				visited: files.length,
				truncated: false,
				ignoredPathCount: 0,
			};
			await this._scanResource(folder.uri, state, 0, folderLimit, excludedNames, MAX_SCAN_DEPTH, policy);
			totalIgnored += state.ignoredPathCount;
			truncated = truncated || state.truncated || files.length >= maxFiles;
			perRoot.push({
				folderName: folder.name,
				filesIndexed: files.length - countBefore,
				truncated: state.truncated || files.length >= maxFiles,
			});
		}
		this._scanRotation++;

		const projects = this._createProjects(projectsByRoot);
		const graph: IQuantumIDEWorkspaceGraph = {
			version: 1,
			workspaceId: workspace.id,
			folders,
			projects,
			manifests,
			files,
			status: {
				indexed: true,
				generatedAt: new Date().toISOString(),
				reason,
				truncated,
				fileLimit: maxFiles,
				perRoot,
			},
		};
		this._storeGraph(graph);
		const durationMs = Date.now() - refreshStart;
		recordQuantumIDEWorkspaceGraphFullRescan({
			durationMs,
			fileCount: graph.files.length,
			truncated: !!graph.status.truncated,
			ignoredPathCount: totalIgnored,
		});
		this._logService.info(formatQuantumIDEWorkspaceDiscoveryLog({
			component: 'workspace-graph',
			operation: 'refresh-full',
			fileCount: graph.files.length,
			truncated: graph.status.truncated,
			durationMs,
		}) + ` ${summarizeQuantumIDEWorkspaceGraph(graph)}`);
		this._logService.debug(formatQuantumIDEWorkspaceDiscoveryLog({
			component: 'ignore-policy',
			operation: 'scan-ignored-paths',
			matchCount: totalIgnored,
		}));
		return graph;
	}

	private _rotatedWorkspaceFolders(folders: readonly IWorkspaceFolder[]): readonly IWorkspaceFolder[] {
		if (folders.length <= 1) {
			return folders;
		}
		const offset = this._scanRotation % folders.length;
		return [...folders.slice(offset), ...folders.slice(0, offset)];
	}

	/** Shallow snapshot for agent context when full indexing is off — still lists every workspace root and top-level layout. */
	private async _buildLiteWorkspaceGraph(workspaceId: string, folders: readonly IQuantumIDEWorkspaceFolderNode[], reason: string): Promise<IQuantumIDEWorkspaceGraph> {
		const workspace = this._workspaceContextService.getWorkspace();
		const files: IQuantumIDEFileNode[] = [];
		const manifests: IQuantumIDEManifestNode[] = [];
		const projectsByRoot = new Map<string, IQuantumIDEScanState['projectsByRoot'] extends Map<string, infer T> ? T : never>();
		let truncated = false;

		const policy = await this._ensureIgnorePolicy();
		const excludedNames = policy.excludedDirectoryNames;
		const rootCount = workspace.folders.length;
		const litePerFolder = computeQuantumIDELiteGraphPerRootBudget(rootCount);
		const effectiveMaxFiles = computeQuantumIDELiteGraphEffectiveMaxFiles(rootCount);
		const perRoot: IQuantumIDEWorkspaceRootScanSummary[] = [];
		const liteStart = Date.now();
		const rotatedFolders = this._rotatedWorkspaceFolders(workspace.folders);
		const rootResults = await runQuantumIDERootScansInParallel(
			rotatedFolders,
			folder => this._scanLiteWorkspaceRoot(folder, litePerFolder, excludedNames, policy),
			computeQuantumIDEMultiRootScanConcurrency(rootCount),
		);
		for (const result of rootResults) {
			files.push(...result.files);
			manifests.push(...result.manifests);
			for (const [key, project] of result.projectsByRoot) {
				projectsByRoot.set(key, project);
			}
			truncated = truncated || result.truncated || files.length >= effectiveMaxFiles;
			perRoot.push({
				folderName: result.folderName,
				filesIndexed: result.filesIndexed,
				truncated: result.truncated || files.length >= effectiveMaxFiles,
			});
		}
		const liteDurationMs = Date.now() - liteStart;

		const graph: IQuantumIDEWorkspaceGraph = {
			version: 1,
			workspaceId,
			folders,
			projects: this._createProjects(projectsByRoot),
			manifests,
			files,
			status: {
				indexed: true,
				generatedAt: new Date().toISOString(),
				reason: `${reason} (lite snapshot; full indexing disabled)`,
				truncated: truncated || files.length > MAX_LITE_INDEX_FILES,
				fileLimit: effectiveMaxFiles,
				perRoot,
			},
		};
		this._storeGraph(graph);
		this._logService.info(formatQuantumIDEWorkspaceDiscoveryLog({
			component: 'workspace-graph',
			operation: 'refresh-lite-parallel',
			fileCount: graph.files.length,
			truncated: graph.status.truncated,
			durationMs: liteDurationMs,
		}) + ` ${summarizeQuantumIDEWorkspaceGraph(graph)}`);
		return graph;
	}

	private async _scanLiteWorkspaceRoot(
		folder: IWorkspaceFolder,
		litePerFolder: number,
		excludedNames: ReadonlySet<string>,
		policy: IQuantumIDEWorkspaceIgnorePolicy,
	): Promise<IQuantumIDELiteRootScanResult> {
		const rootFiles: IQuantumIDEFileNode[] = [];
		const rootManifests: IQuantumIDEManifestNode[] = [];
		const rootProjects = new Map<string, IQuantumIDEScanState['projectsByRoot'] extends Map<string, infer T> ? T : never>();
		const state: IQuantumIDEScanState = {
			workspaceFolder: folder,
			rootRelativePrefix: folder.name,
			files: rootFiles,
			manifests: rootManifests,
			projectsByRoot: rootProjects,
			visited: 0,
			truncated: false,
			ignoredPathCount: 0,
		};
		await this._scanResource(folder.uri, state, 0, litePerFolder, excludedNames, MAX_LITE_SCAN_DEPTH, policy);
		return {
			folderName: folder.name,
			files: rootFiles,
			manifests: rootManifests,
			projectsByRoot: rootProjects,
			truncated: state.truncated,
			filesIndexed: rootFiles.length,
		};
	}

	private async _ensureIgnorePolicy(): Promise<IQuantumIDEWorkspaceIgnorePolicy> {
		if (this._ignorePolicy) {
			return this._ignorePolicy;
		}
		const folders = this._workspaceContextService.getWorkspace().folders;
		const roots = collectAgentSearchRoots(
			folders[0]?.uri,
			formatWorkspaceFolderLinks(folders.map(f => ({ name: f.name, uri: f.uri }))),
		);
		const secrets = this._configurationService.getValue<string[]>(QuantumIDEAISettingId.IndexingSecretFileNames) ?? [];
		const configured = this._configurationService.getValue<readonly string[]>(QuantumIDEAISettingId.IndexingExcludePatterns) ?? [];
		const unifiedIgnore = this._configurationService.getValue<string>(QuantumIDEAISettingId.IndexingIgnoreFile) ?? '.quantumideignore';
		const base = await loadQuantumIDEWorkspaceIgnorePolicy(
			this._fileService,
			roots,
			new Set(QuantumIDEWorkspaceIndexExcludeNames),
			secrets,
			{ unifiedIgnoreFile: unifiedIgnore },
		);
		this._ignorePolicy = mergeQuantumIDEIndexingExcludePatterns(base, configured);
		return this._ignorePolicy;
	}

	private _accumulateFileWatcherChanges(event: FileChangesEvent): void {
		this._pendingWatcherAdded.push(...event.rawAdded);
		this._pendingWatcherUpdated.push(...event.rawUpdated);
		this._pendingWatcherDeleted.push(...event.rawDeleted);
	}

	private _pendingWatcherChangeCount(): number {
		return this._pendingWatcherAdded.length + this._pendingWatcherUpdated.length + this._pendingWatcherDeleted.length;
	}

	private _takePendingFileWatcherChanges(): { readonly added: readonly URI[]; readonly updated: readonly URI[]; readonly deleted: readonly URI[] } {
		const batch = {
			added: [...this._pendingWatcherAdded],
			updated: [...this._pendingWatcherUpdated],
			deleted: [...this._pendingWatcherDeleted],
		};
		this._pendingWatcherAdded.length = 0;
		this._pendingWatcherUpdated.length = 0;
		this._pendingWatcherDeleted.length = 0;
		return batch;
	}

	private _scheduleFileWatcherGraphRefresh(): void {
		const changeCount = this._pendingWatcherChangeCount();
		const plan = planWorkspaceGraphFileWatcherRefresh({
			changeCount,
			graph: this._graph,
			maxIncrementalChanges: QUANTUMIDE_FILE_WATCHER_MAX_INCREMENTAL_CHANGES,
		});
		const visibilityMs = computeQuantumIDEWatcherGraphVisibilityMs(plan);
		if (visibilityMs > 0) {
			recordQuantumIDEWatcherGraphVisibilityMs(visibilityMs);
		}
		if (plan.runIncremental) {
			this._incrementalScheduler.schedule();
		}
		if (plan.runDebouncedFullRefresh) {
			this._clearPendingFileWatcherChanges();
			this._fileWatcherRefreshScheduler.schedule();
		}
	}

	private _clearPendingFileWatcherChanges(): void {
		this._pendingWatcherAdded.length = 0;
		this._pendingWatcherUpdated.length = 0;
		this._pendingWatcherDeleted.length = 0;
	}

	private _requeuePendingFileWatcherChanges(pending: {
		readonly added: readonly URI[];
		readonly updated: readonly URI[];
		readonly deleted: readonly URI[];
	}): void {
		this._pendingWatcherAdded.push(...pending.added);
		this._pendingWatcherUpdated.push(...pending.updated);
		this._pendingWatcherDeleted.push(...pending.deleted);
	}

	private async _runIncrementalGraphPatch(): Promise<void> {
		if (!this._workspaceTrustManagementService.isWorkspaceTrusted()) {
			return;
		}
		const pending = this._takePendingFileWatcherChanges();
		const graphAtStart = this._graph;
		const graph = graphAtStart;
		const changeCount = pending.added.length + pending.updated.length + pending.deleted.length;
		const plan = planWorkspaceGraphFileWatcherRefresh({
			changeCount,
			graph,
			maxIncrementalChanges: QUANTUMIDE_FILE_WATCHER_MAX_INCREMENTAL_CHANGES,
		});
		if (changeCount <= 0 || !plan.runIncremental || !graph) {
			if (changeCount > 0 && plan.runDebouncedFullRefresh) {
				this._fileWatcherRefreshScheduler.schedule();
			}
			return;
		}
		const patchLease = tryAcquireQuantumIDEWorkspaceGraphIncrementalPatch(getQuantumIDEWorkspaceGraphGeneration());
		if (!patchLease) {
			this._requeuePendingFileWatcherChanges(pending);
			if (!this._refreshPromise) {
				this._incrementalScheduler.schedule();
			}
			return;
		}
		const start = Date.now();
		try {
			const policy = await this._ensureIgnorePolicy();
			let files = [...graph.files];
			const manifests = [...graph.manifests];
			for (const deleted of pending.deleted) {
				const del = deleted.toString();
				files = files.filter(f => f.uri !== del);
			}
			const upsertFile = async (resource: URI) => {
				if (files.length >= (graph.status.fileLimit ?? MAX_INDEX_FILES)) {
					return;
				}
				try {
					const stat = await this._fileService.resolve(resource);
					const folder = this._workspaceContextService.getWorkspace().folders.find(f =>
						resource.fsPath.startsWith(f.uri.fsPath));
					if (!folder || !stat.isFile) {
						return;
					}
					const rel = this._workspaceRelativePath(folder, resource);
					if (isQuantumIDEPathIgnored(rel, policy, 'index', stat.name)) {
						return;
					}
					files.push({
						uri: resource.toString(),
						workspaceRelativePath: rel,
						name: stat.name,
						extension: extname(stat.name) || undefined,
					});
				} catch {
					// skip
				}
			};
			for (const added of pending.added) {
				await upsertFile(added);
			}
			for (const updated of pending.updated) {
				const key = updated.toString();
				files = files.filter(f => f.uri !== key);
				await upsertFile(updated);
			}
			const updatedGraph: IQuantumIDEWorkspaceGraph = {
				...graph,
				files,
				manifests,
				status: {
					...graph.status,
					generatedAt: new Date().toISOString(),
					reason: `incremental patch (${changeCount} change(s))`,
				},
			};
			if (!shouldCommitQuantumIDEWorkspaceGraphIncrementalPatch(
				patchLease,
				graphAtStart,
				this._graph,
				getQuantumIDEWorkspaceGraphGeneration(),
			)) {
				this._requeuePendingFileWatcherChanges(pending);
				this._logService.debug(formatQuantumIDEWorkspaceDiscoveryLog({
					component: 'workspace-graph',
					operation: 'incremental-patch-discarded',
					matchCount: changeCount,
					fallback: 'full-refresh-in-flight-or-stale-generation',
				}));
				return;
			}
			this._storeGraph(updatedGraph);
			recordQuantumIDEWorkspaceGraphIncrementalPatch(changeCount);
			this._fileWatcherRefreshScheduler.cancel();
			this._logService.info(formatQuantumIDEWorkspaceDiscoveryLog({
				component: 'workspace-graph',
				operation: 'incremental-patch',
				fileCount: files.length,
				durationMs: Date.now() - start,
				matchCount: changeCount,
			}));
		} catch (err) {
			this._requeuePendingFileWatcherChanges(pending);
			this._logService.warn(formatQuantumIDEWorkspaceDiscoveryLog({
				component: 'workspace-graph',
				operation: 'incremental-patch',
				error: String(err),
				matchCount: changeCount,
			}));
			this._fileWatcherRefreshScheduler.schedule();
		} finally {
			releaseQuantumIDEWorkspaceGraphIncrementalPatch(patchLease);
		}
	}

	private async _scanResource(
		resource: URI,
		state: IQuantumIDEScanState,
		depth: number,
		maxFiles: number,
		excludedNames: ReadonlySet<string>,
		maxDepth: number = MAX_SCAN_DEPTH,
		policy?: IQuantumIDEWorkspaceIgnorePolicy,
	): Promise<void> {
		if (depth > maxDepth || state.files.length >= maxFiles) {
			state.truncated = state.truncated || state.files.length >= maxFiles;
			return;
		}
		let stat: IFileStat;
		try {
			stat = await this._fileService.resolve(resource);
		} catch {
			return;
		}
		if (stat.isFile) {
			this._addFile(stat, state, policy);
			return;
		}
		if (!stat.isDirectory || !stat.children) {
			return;
		}

		const children = [...stat.children].sort((left, right) => left.name.localeCompare(right.name));
		for (const child of children) {
			const manifestKind = detectQuantumIDEManifestKind(child.name);
			if (manifestKind) {
				this._addManifest(child, manifestKind, state);
			}
			if (excludedNames.has(child.name)) {
				continue;
			}
			const childRel = this._workspaceRelativePath(state.workspaceFolder, child.resource);
			if (policy && isQuantumIDEPathIgnored(childRel, policy, 'index', child.name)) {
				state.ignoredPathCount++;
				continue;
			}
			if (state.files.length >= maxFiles) {
				state.truncated = true;
				return;
			}
			await this._scanResource(child.resource, state, depth + 1, maxFiles, excludedNames, maxDepth, policy);
		}
	}

	private _addFile(stat: IFileStat, state: IQuantumIDEScanState, policy?: IQuantumIDEWorkspaceIgnorePolicy): void {
		const workspaceRelativePath = this._workspaceRelativePath(state.workspaceFolder, stat.resource);
		if (policy && isQuantumIDEPathIgnored(workspaceRelativePath, policy, 'index', stat.name)) {
			state.ignoredPathCount++;
			return;
		}
		state.files.push({
			uri: stat.resource.toString(),
			workspaceRelativePath,
			name: stat.name,
			extension: extname(stat.name) || undefined,
		});
	}

	private _addManifest(stat: IFileStat, kind: QuantumIDEManifestKind, state: IQuantumIDEScanState): void {
		const projectUri = kind === QuantumIDEManifestKind.Git ? stat.resource : URI.joinPath(stat.resource, '..');
		const workspaceRelativePath = this._workspaceRelativePath(state.workspaceFolder, stat.resource);
		const projectPath = this._workspaceRelativePath(state.workspaceFolder, projectUri);
		state.manifests.push({
			kind,
			name: stat.name,
			uri: stat.resource.toString(),
			workspaceRelativePath,
			projectPath,
		});

		const projectKey = projectUri.toString();
		let project = state.projectsByRoot.get(projectKey);
		if (!project) {
			project = {
				rootUri: projectUri.toString(),
				workspaceRelativePath: projectPath,
				manifestKinds: new Set<QuantumIDEManifestKind>(),
				frameworks: new Set<string>(),
			};
			state.projectsByRoot.set(projectKey, project);
		}
		project.manifestKinds.add(kind);
		this._detectFrameworkHints(kind, stat).forEach(framework => project?.frameworks.add(framework));
	}

	private _detectFrameworkHints(kind: QuantumIDEManifestKind, stat: IFileStat): readonly string[] {
		if (kind === QuantumIDEManifestKind.PackageJson) {
			const path = stat.resource.path.toLowerCase();
			if (path.includes('/next') || path.includes('/app/')) {
				return ['node', 'typescript'];
			}
			return ['node'];
		}
		if (kind === QuantumIDEManifestKind.TsConfig) {
			return ['typescript'];
		}
		return [];
	}

	private _createProjects(projectsByRoot: IQuantumIDEScanState['projectsByRoot']): IQuantumIDEProjectNode[] {
		return [...projectsByRoot.values()]
			.map(project => {
				const manifestKinds = [...project.manifestKinds].sort((left, right) => left.localeCompare(right));
				const ecosystem = this._chooseProjectEcosystem(manifestKinds);
				return {
					id: project.rootUri,
					name: basename(URI.parse(project.rootUri).path) || project.workspaceRelativePath || 'workspace',
					rootUri: project.rootUri,
					workspaceRelativePath: project.workspaceRelativePath,
					ecosystem,
					manifestKinds,
					frameworks: [...project.frameworks].sort(),
				};
			})
			.sort((left, right) => left.workspaceRelativePath.localeCompare(right.workspaceRelativePath));
	}

	private _chooseProjectEcosystem(manifestKinds: readonly QuantumIDEManifestKind[]): string {
		const preferred = manifestKinds.find(kind => kind !== QuantumIDEManifestKind.Git && kind !== QuantumIDEManifestKind.TsConfig);
		return getQuantumIDEManifestEcosystem(preferred ?? manifestKinds[0] ?? QuantumIDEManifestKind.Git);
	}

	private _buildActiveEditorContext(): string {
		const editor = this._codeEditorService.getActiveCodeEditor();
		const model = editor?.getModel();
		if (!editor || !model) {
			return '- No active text editor.';
		}
		const selection = editor.getSelection();
		const uri = model.uri.toString();
		if (!selection || selection.isEmpty()) {
			return `- ${uri}`;
		}
		const range = new Range(selection.startLineNumber, selection.startColumn, selection.endLineNumber, selection.endColumn);
		const selectedText = model.getValueInRange(range).slice(0, 2_000);
		return [`- ${uri}`, `Selection: ${selection.startLineNumber}:${selection.startColumn}-${selection.endLineNumber}:${selection.endColumn}`, selectedText ? this._indent(selectedText, '  ') : '  [empty selection]'].join('\n');
	}

	private _buildDiagnosticsContext(): string {
		const uri = this._codeEditorService.getActiveCodeEditor()?.getModel()?.uri;
		if (!uri) {
			return '- No active editor diagnostics are available.';
		}
		const markers = this._markerService.read({ resource: uri })
			.sort((left, right) => MarkerSeverity.compare(left.severity, right.severity))
			.slice(0, MAX_DIAGNOSTICS_IN_CONTEXT);
		if (markers.length === 0) {
			return '- No diagnostics reported for the active editor.';
		}
		return markers.map(marker => `- ${this._severityLabel(marker.severity)} ${marker.startLineNumber}:${marker.startColumn} ${marker.source ? `[${marker.source}] ` : ''}${marker.message}`).join('\n');
	}

	private _buildSCMContext(): string {
		const lines: string[] = [];
		let count = 0;
		for (const repository of this._scmService.repositories) {
			const root = repository.provider.rootUri?.toString() ?? repository.provider.label;
			lines.push(`Repository: ${root}`);
			for (const group of repository.provider.groups) {
				if (group.resources.length === 0) {
					continue;
				}
				lines.push(`  ${group.label}:`);
				for (const resource of group.resources) {
					if (count >= MAX_SCM_RESOURCES_IN_CONTEXT) {
						lines.push(`  - ...additional changed resources omitted after ${MAX_SCM_RESOURCES_IN_CONTEXT} entries.`);
						return lines.join('\n');
					}
					const status = resource.decorations.tooltip ?? resource.contextValue ?? 'changed';
					lines.push(`  - ${resource.sourceUri.toString()} (${status})`);
					count++;
				}
			}
		}
		return lines.length ? lines.join('\n') : '- No SCM changes detected.';
	}

	private _workspaceRelativePath(folder: IWorkspaceFolder, resource: URI): string {
		const relative = relativePath(folder.uri, resource) ?? '';
		return relative ? `${folder.name}/${relative}` : folder.name;
	}

	private _getWorkspaceFolders(): IQuantumIDEWorkspaceFolderNode[] {
		return this._workspaceContextService.getWorkspace().folders.map(folder => ({
			name: folder.name,
			uri: folder.uri.toString(),
		}));
	}

	private _getMaxIndexFiles(): number {
		const configured = this._configurationService.getValue<number>(QuantumIDEAISettingId.AgentMaxContextFiles) ?? 20;
		return Math.min(Math.max(configured * 10, MIN_INDEX_FILES), MAX_INDEX_FILES);
	}

	private _getMaxContextFiles(): number {
		const configured = this._configurationService.getValue<number>(QuantumIDEAISettingId.AgentMaxContextFiles) ?? 20;
		return Math.max(1, configured);
	}

	private _storeGraph(graph: IQuantumIDEWorkspaceGraph): void {
		this._graph = graph;
		this._structureIndex = buildQuantumIDEWorkspaceGraphStructureIndexFromGraph(graph);
		this._rebuildCachedAtMentionPaths();
		this._storageService.store(QUANTUMIDE_AI_WORKSPACE_INDEX_STORAGE_KEY, JSON.stringify(graph), StorageScope.APPLICATION, StorageTarget.MACHINE);
		this._onDidChangeGraph.fire(graph);
		void this._persistStructureIndexSnapshot(graph);
		void this._persistAgentSnapshot(graph);
	}

	private async _persistAgentSnapshot(graph: IQuantumIDEWorkspaceGraph): Promise<void> {
		if (!graph.status.indexed || graph.files.length === 0) {
			return;
		}
		const folder = this._workspaceContextService.getWorkspace().folders[0];
		if (!folder) {
			return;
		}
		const snapshot = buildQuantumIDEWorkspaceAgentSnapshot(graph, getQuantumIDEWorkspaceGraphGeneration());
		try {
			await this._fileService.writeFile(
				joinPath(folder.uri, QUANTUMIDE_AGENT_SNAPSHOT_FILE),
				VSBuffer.fromString(serializeQuantumIDEWorkspaceAgentSnapshot(snapshot)),
			);
			this._logService.info(formatQuantumIDEWorkspaceDiscoveryLog({
				component: 'workspace-graph',
				operation: 'agent-snapshot-persist',
				fileCount: snapshot.fileCount,
			}));
		} catch (err) {
			this._logService.warn(formatQuantumIDEWorkspaceDiscoveryLog({
				component: 'workspace-graph',
				operation: 'agent-snapshot-persist',
				error: String(err),
			}));
		}
	}

	private async _persistStructureIndexSnapshot(graph: IQuantumIDEWorkspaceGraph): Promise<void> {
		if (!graph.status.indexed || graph.files.length === 0) {
			return;
		}
		const folder = this._workspaceContextService.getWorkspace().folders[0];
		if (!folder) {
			return;
		}
		const snapshot = createQuantumIDEStructureIndexSnapshot(graph.files.map(f => f.workspaceRelativePath));
		try {
			await this._fileService.writeFile(
				joinPath(folder.uri, QUANTUMIDE_STRUCTURE_INDEX_FILE),
				VSBuffer.fromString(JSON.stringify(snapshot)),
			);
			this._logService.debug(formatQuantumIDEWorkspaceDiscoveryLog({
				component: 'workspace-graph',
				operation: 'structure-index-persist',
				fileCount: snapshot.paths.length,
			}));
		} catch (err) {
			this._logService.warn(formatQuantumIDEWorkspaceDiscoveryLog({
				component: 'workspace-graph',
				operation: 'structure-index-persist',
				error: String(err),
			}));
		}
	}

	private _readStoredGraph(): IQuantumIDEWorkspaceGraph | undefined {
		const raw = this._storageService.get(QUANTUMIDE_AI_WORKSPACE_INDEX_STORAGE_KEY, StorageScope.APPLICATION);
		if (!raw) {
			return undefined;
		}
		try {
			const parsed = JSON.parse(raw) as IQuantumIDEWorkspaceGraph;
			if (parsed.version !== 1) {
				return undefined;
			}
			const currentId = this._workspaceContextService.getWorkspace().id;
			if (parsed.workspaceId && currentId && parsed.workspaceId !== currentId) {
				this._logService.debug(formatQuantumIDEWorkspaceDiscoveryLog({
					component: 'workspace-graph',
					operation: 'cache-stale',
					error: `workspaceId mismatch ${parsed.workspaceId} vs ${currentId}`,
				}));
				return undefined;
			}
			return parsed;
		} catch {
			return undefined;
		}
	}

	private _severityLabel(severity: MarkerSeverity): string {
		switch (severity) {
			case MarkerSeverity.Error:
				return 'Error';
			case MarkerSeverity.Warning:
				return 'Warning';
			case MarkerSeverity.Info:
				return 'Info';
			case MarkerSeverity.Hint:
				return 'Hint';
		}
	}

	private _indent(value: string, prefix: string): string {
		return value.split(/\r?\n/).map(line => `${prefix}${line}`).join('\n');
	}

	private _clip(value: string, maxChars: number): string {
		if (value.length <= maxChars) {
			return value;
		}
		const footer = `\n\n[QuantumIDE workspace context truncated to ${maxChars} characters.]`;
		const bodyBudget = Math.max(0, maxChars - footer.length);
		return `${clipQuantumIDEUtf16Safe(value, bodyBudget)}${footer}`;
	}
}

registerSingleton(IQuantumIDEWorkspaceContextService, QuantumIDEWorkspaceContextService, InstantiationType.Delayed);
