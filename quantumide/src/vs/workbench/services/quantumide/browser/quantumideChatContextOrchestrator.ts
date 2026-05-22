/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { basename } from '../../../../base/common/path.js';
import { joinPath } from '../../../../base/common/resources.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { Range } from '../../../../editor/common/core/range.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IMarkerService, MarkerSeverity } from '../../../../platform/markers/common/markers.js';
import { markQuantumIDEPerformanceEnd, markQuantumIDEPerformanceStart, QuantumIDEPerformanceMark } from '../../../../platform/quantumide/common/quantumidePerformanceMarks.js';
import {
	appendPartialContextFooter,
	assertWithinBudget,
	discoveryBudgetDeadlineMs,
	isDiscoveryBudgetExceeded,
	QuantumIDEPerformanceBudgetMs,
	runDiscoveryWithinBudget,
} from '../../../../platform/quantumide/common/quantumidePerformanceBudgets.js';
import { buildSemanticIndexFeedContextSections } from '../../../../platform/quantumide/common/quantumideSemanticIndexFeed.js';
import {
	formatProjectManifestSummaries,
	manifestNodesToSummaryRequests,
	parseProjectManifestSummary,
} from '../../../../platform/quantumide/common/quantumideProjectManifest.js';
import { formatRankedContext, rankAndTrimContextSections, type IQuantumIDEContextSection } from '../../../../platform/quantumide/common/quantumideContextRanker.js';
import { analyzeTerminalOutput, formatTerminalInsights } from '../../../../platform/quantumide/common/quantumideTerminalAnalysis.js';
import { QuantumIDEAISettingId } from '../../../../platform/quantumide/common/quantumideAISettings.js';
import { formatQuantumIDEWorkspaceTrustWarningForContext } from '../../../../platform/quantumide/common/quantumideWorkspaceTrust.js';
import { IWorkspaceTrustManagementService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { EditorResourceAccessor, SideBySideEditor } from '../../../common/editor.js';
import { ITerminalService } from '../../../contrib/terminal/browser/terminal.js';
import { IEditorService } from '../../editor/common/editorService.js';
import { IHistoryService } from '../../history/common/history.js';
import { IWorkingCopyHistoryService } from '../../workingCopy/common/workingCopyHistory.js';
import { IQuantumIDERecentlyViewedFilesService } from '../common/quantumideRecentlyViewedFiles.js';
import { IQuantumIDEWorkspaceContextService } from '../common/quantumideWorkspaceContext.js';
import { IQuantumIDEChatContextBuildOptions, IQuantumIDEChatContextOrchestrator } from '../common/quantumideChatContext.js';
import { IQuantumIDEEditorStateService } from './quantumideEditorStateService.js';
import { IQuantumIDEContextExpansionService } from './quantumideContextExpansionService.js';
import { IQuantumIDELspSymbolIndexService } from '../common/quantumideLspSymbolIndex.js';
import { IQuantumIDESemanticIndexService } from '../common/quantumideSemanticIndex.js';
import { IQuantumIDEWorkspaceSymbolIndexService } from '../common/quantumideWorkspaceSymbolIndex.js';
import { IQuantumIDEContextHealthService } from '../common/quantumideContextHealth.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { formatQuantumIDEWorkspaceDiscoveryLog } from '../../../../platform/quantumide/common/quantumideWorkspaceDiscoveryLog.js';
import { IQuantumIDEContextInspectorService } from '../common/quantumideContextInspector.js';
import { IQuantumIDENavigationHistoryService } from '../common/quantumideNavigationHistory.js';
import { ITextFileService } from '../../textfile/common/textfiles.js';
import { IMcpService } from '../../../contrib/mcp/common/mcpTypes.js';

const MAX_OPEN_TABS = 12;
const MAX_NAVIGATION_ENTRIES = 8;
const MAX_TERMINAL_OUTPUT_CHARS = 1500;
const MAX_FILE_HISTORY_ENTRIES = 5;
const MAX_LIVE_DIAGNOSTICS = 80;

export class QuantumIDEChatContextOrchestrator extends Disposable implements IQuantumIDEChatContextOrchestrator {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeContext = this._register(new Emitter<void>());
	readonly onDidChangeContext = this._onDidChangeContext.event;

	private readonly _syncScheduler = this._register(new RunOnceScheduler(() => this._onDidChangeContext.fire(), 400));
	private readonly _terminalOutputCache = new Map<string, string>();

	constructor(
		@IQuantumIDEWorkspaceContextService private readonly _quantumIDEWorkspaceContextService: IQuantumIDEWorkspaceContextService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ICodeEditorService private readonly _codeEditorService: ICodeEditorService,
		@IEditorService private readonly _editorService: IEditorService,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@IHistoryService private readonly _historyService: IHistoryService,
		@IMarkerService private readonly _markerService: IMarkerService,
		@IQuantumIDESemanticIndexService private readonly _semanticIndexService: IQuantumIDESemanticIndexService,
		@IQuantumIDELspSymbolIndexService private readonly _lspSymbolIndexService: IQuantumIDELspSymbolIndexService,
		@IQuantumIDEWorkspaceSymbolIndexService private readonly _workspaceSymbolIndexService: IQuantumIDEWorkspaceSymbolIndexService,
		@IFileService private readonly _fileService: IFileService,
		@IWorkspaceContextService private readonly _folderWorkspaceService: IWorkspaceContextService,
		@IWorkingCopyHistoryService private readonly _workingCopyHistoryService: IWorkingCopyHistoryService,
		@IQuantumIDEEditorStateService private readonly _editorStateService: IQuantumIDEEditorStateService,
		@IQuantumIDEContextExpansionService private readonly _contextExpansionService: IQuantumIDEContextExpansionService,
		@IQuantumIDEContextHealthService private readonly _contextHealth: IQuantumIDEContextHealthService,
		@IQuantumIDEContextInspectorService private readonly _contextInspector: IQuantumIDEContextInspectorService,
		@IQuantumIDENavigationHistoryService private readonly _navigationHistory: IQuantumIDENavigationHistoryService,
		@ITextFileService private readonly _textFileService: ITextFileService,
		@IQuantumIDERecentlyViewedFilesService private readonly _recentlyViewed: IQuantumIDERecentlyViewedFilesService,
		@ILogService private readonly _logService: ILogService,
		@IMcpService private readonly _mcpService: IMcpService,
		@IWorkspaceTrustManagementService private readonly _workspaceTrustManagementService: IWorkspaceTrustManagementService,
	) {
		super();
		if (this._configurationService.getValue<boolean>(QuantumIDEAISettingId.ChatSyncRealtime) !== false) {
			const markStale = () => this._contextInspector.markContextStale();
			this._register(this._codeEditorService.onCodeEditorAdd(() => { markStale(); this._syncScheduler.schedule(); }));
			this._register(this._editorService.onDidActiveEditorChange(() => {
				markStale();
				this._syncScheduler.schedule();
				void this._lspSymbolIndexService.refreshActiveEditorSymbols();
			}));
			this._register(this._editorService.onDidCloseEditor(() => { markStale(); this._syncScheduler.schedule(); }));
			this._register(this._terminalService.onDidChangeActiveInstance(() => { markStale(); this._syncScheduler.schedule(); }));
			this._register(this._terminalService.onAnyInstanceData(e => {
				const key = e.instance.instanceId.toString();
				const prior = this._terminalOutputCache.get(key) ?? '';
				this._terminalOutputCache.set(key, (prior + e.data).slice(-MAX_TERMINAL_OUTPUT_CHARS));
				this._syncScheduler.schedule();
			}));
			this._register(this._markerService.onMarkerChanged(() => { markStale(); this._syncScheduler.schedule(); }));
			this._register(this._lspSymbolIndexService.onDidChangeSymbols(() => { markStale(); this._syncScheduler.schedule(); }));
			this._register(this._codeEditorService.onCodeEditorAdd(editor => {
				const model = editor.getModel();
				if (!model) {
					return;
				}
				this._register(model.onDidChangeContent(() => this._syncScheduler.schedule()));
				this._register(editor.onDidChangeCursorPosition(() => this._syncScheduler.schedule()));
			}));
		}
	}

	async buildChatContext(options: IQuantumIDEChatContextBuildOptions = {}): Promise<string> {
		markQuantumIDEPerformanceStart(QuantumIDEPerformanceMark.ChatStartup);
		markQuantumIDEPerformanceStart(QuantumIDEPerformanceMark.ChatContextBuild);
		const startupDeadline = discoveryBudgetDeadlineMs(QuantumIDEPerformanceBudgetMs.chatStartup);
		const buildDeadline = discoveryBudgetDeadlineMs(QuantumIDEPerformanceBudgetMs.chatContextBuild);
		const shouldStopDiscovery = (): boolean => isDiscoveryBudgetExceeded(buildDeadline) || isDiscoveryBudgetExceeded(startupDeadline);
		const tokenBudget = this._configurationService.getValue<number>(QuantumIDEAISettingId.ChatTokenBudget) ?? 12000;
		const ranked: IQuantumIDEContextSection[] = [];
		let degraded = false;

		try {
			if (!this._workspaceTrustManagementService.isWorkspaceTrusted()) {
				ranked.push({
					id: 'workspace-trust-warning',
					title: 'Workspace trust',
					body: formatQuantumIDEWorkspaceTrustWarningForContext(),
					priority: 102,
				});
			}
			const byRoot = await runDiscoveryWithinBudget('workspace-context', buildDeadline, () =>
				this._quantumIDEWorkspaceContextService.buildWorkspaceContextByRoot({
					maxChars: options.maxChars,
					includeActiveEditor: options.includeActiveEditor,
					includeDiagnostics: options.includeDiagnostics,
					includeSCM: options.includeSCM,
					splitRootsForRanking: true,
				}));
			if (byRoot?.primary.trim()) {
				ranked.push({ id: 'workspace', title: '', body: byRoot.primary, priority: 100 });
			}
			if (byRoot?.secondary?.trim()) {
				ranked.push({ id: 'workspace-other-roots', title: 'Other workspace roots', body: byRoot.secondary, priority: 42 });
			}
			if (!byRoot) {
				degraded = true;
				const fallback = this._buildCachedWorkspaceFallback();
				if (fallback) {
					ranked.push({ id: 'workspace', title: '', body: fallback, priority: 100 });
				}
			}
			await this._pushSection(ranked, 'editor-state', 'Active editor state', 96, async () => this._editorStateService.formatEditorStateForContext() ?? undefined, shouldStopDiscovery);
			await this._pushSection(ranked, 'selection', 'Active selection', 95, async () => this._buildSelectionContext(), shouldStopDiscovery);
			if (options.includeBranch !== false) {
				await this._pushSection(ranked, 'branch', 'Git branch', 70, () => this._buildGitBranchContext(), shouldStopDiscovery);
			}
			if (options.includeOpenTabs !== false && !shouldStopDiscovery()) {
				const tabs = this._buildOpenTabsContext();
				if (tabs) {
					ranked.push({ id: 'tabs', title: 'Open tabs', body: tabs, priority: 65 });
				}
			}
			if (!shouldStopDiscovery()) {
				const recent = this._buildRecentlyViewedContext();
				if (recent) {
					ranked.push({ id: 'recent-files', title: 'Recently viewed files', body: recent, priority: 64 });
				}
			}
			if (!shouldStopDiscovery()) {
				const mcp = this._buildMcpResourcesContext();
				if (mcp) {
					ranked.push({ id: 'mcp-resources', title: 'MCP servers (external)', body: mcp, priority: 40 });
				}
			}
			if (options.includeTerminal !== false && !shouldStopDiscovery()) {
				const terminal = this._buildTerminalContext();
				if (terminal) {
					ranked.push({ id: 'terminal', title: 'Terminal sessions', body: terminal, priority: 75 });
				}
				const rawOutput = this._buildTerminalOutputContext();
				if (rawOutput) {
					const insights = formatTerminalInsights(analyzeTerminalOutput(rawOutput));
					ranked.push({ id: 'terminal-output', title: 'Terminal output (parsed)', body: `${rawOutput}\n\n${insights}`, priority: 80 });
				}
			}
			if (!shouldStopDiscovery()) {
				const lspSymbols = await this._lspSymbolIndexService.getSymbolGraphPreview(30);
				if (lspSymbols.length > 0) {
					ranked.push({
						id: 'lsp-active',
						title: 'LSP symbol graph (active editor)',
						body: lspSymbols.map(s => `- ${s.name} (${s.kind}) line ${s.line}`).join('\n'),
						priority: 60,
					});
				}
			}
			if (!shouldStopDiscovery()) {
				const wsSymbols = this._workspaceSymbolIndexService.getSymbols().slice(0, 35);
				if (wsSymbols.length > 0) {
					ranked.push({
						id: 'symbols-workspace',
						title: 'Workspace symbol index',
						body: wsSymbols.map(s => `- ${s.path}:${s.line} ${s.kind} ${s.name}`).join('\n'),
						priority: 55,
					});
				}
			}
			const userQuery = options.userQuery;
			if (!shouldStopDiscovery()) {
				for (const section of buildSemanticIndexFeedContextSections({
					semantic: this._semanticIndexService.getSemanticIndex(),
					ast: this._semanticIndexService.getAstIndex(),
					dependencyGraph: this._semanticIndexService.getDependencyGraph(),
					diagnostics: this._semanticIndexService.getDiagnosticsIndex(),
					comments: this._semanticIndexService.getCommentsIndex(),
					userQuery,
				})) {
					ranked.push(section);
				}
			}
			if (!shouldStopDiscovery()) {
				const liveDiagnostics = this._buildLiveDiagnosticsContext();
				if (liveDiagnostics) {
					ranked.push({
						id: 'diagnostics-live',
						title: 'Live diagnostics (errors & warnings)',
						body: liveDiagnostics,
						priority: 88,
					});
				}
			}
			await this._pushSection(ranked, 'project-manifests', 'Project manifests', 92, () => this._buildProjectManifestContext(), shouldStopDiscovery);
			if (userQuery) {
				await this._pushSection(ranked, 'context-expansion', 'Auto-expanded related context', 91, () => this._contextExpansionService.buildAutomaticExpansionSection(userQuery), shouldStopDiscovery);
			}
			if (options.includeNavigationHistory !== false && !shouldStopDiscovery()) {
				const navigation = this._buildNavigationHistoryContext();
				if (navigation) {
					ranked.push({ id: 'navigation', title: 'Editor navigation', body: navigation, priority: 40 });
				}
			}
			await this._pushSection(ranked, 'file-history', 'File history', 35, () => this._buildFileHistoryContext(), shouldStopDiscovery);
		} catch (err) {
			degraded = true;
			this._logService.warn(formatQuantumIDEWorkspaceDiscoveryLog({
				component: 'chat-context',
				operation: 'buildChatContext',
				error: String(err),
			}));
		}

		if (shouldStopDiscovery()) {
			degraded = true;
		}

		const body = this._finalizeChatContextBody(ranked, tokenBudget, degraded);
		const contextElapsed = markQuantumIDEPerformanceEnd(QuantumIDEPerformanceMark.ChatContextBuild) ?? 0;
		const startupElapsed = markQuantumIDEPerformanceEnd(QuantumIDEPerformanceMark.ChatStartup) ?? 0;
		assertWithinBudget('chatContextBuild', contextElapsed, QuantumIDEPerformanceBudgetMs.chatContextBuild);
		assertWithinBudget('chatStartup', startupElapsed, QuantumIDEPerformanceBudgetMs.chatStartup);
		return body;
	}

	private _finalizeChatContextBody(ranked: IQuantumIDEContextSection[], tokenBudget: number, degraded: boolean): string {
		let partial = degraded;
		if (ranked.length === 0) {
			partial = true;
			const fallback = this._buildCachedWorkspaceFallback();
			if (fallback) {
				ranked.push({ id: 'workspace', title: '', body: fallback, priority: 100 });
			}
		}
		const { included, omitted } = rankAndTrimContextSections(ranked, tokenBudget);
		const omittedIds = new Set(omitted);
		this._contextInspector.recordBuild(
			ranked.map(s => ({
				id: s.id,
				title: s.title || s.id,
				charCount: s.body.length,
				omitted: omittedIds.has(s.id),
				tokenEstimate: Math.ceil(s.body.length / 4),
				ageMs: 0,
				stale: partial,
			})),
		);
		let body = formatRankedContext(included, omitted);
		body = appendPartialContextFooter(body, partial);
		if (partial) {
			this._contextHealth.recordFailure('partial context (NFR-CC-01 degradation)');
		} else {
			this._contextHealth.recordSuccess(included.length, omitted.length, this._hasUnsavedEditorBuffers());
		}
		return body;
	}

	private _buildCachedWorkspaceFallback(): string | undefined {
		const graph = this._quantumIDEWorkspaceContextService.getWorkspaceGraph();
		if (!graph) {
			return 'Workspace graph not ready; discovery was skipped due to the configured time budget.';
		}
		const roots = graph.folders.map(f => f.name).join(', ') || '(none)';
		const truncated = graph.status.truncated ? ` Truncated: ${graph.status.reason ?? 'cap reached'}.` : '';
		return `Cached workspace snapshot: roots [${roots}], ${graph.files.length} indexed paths.${truncated} Use @file or agent search tools for paths not listed.`;
	}

	private _hasUnsavedEditorBuffers(): boolean {
		for (const model of this._textFileService.files.models) {
			if (!model.isDisposed() && this._textFileService.isDirty(model.resource)) {
				return true;
			}
		}
		return false;
	}

	private async _pushSection(
		ranked: IQuantumIDEContextSection[],
		id: string,
		title: string,
		priority: number,
		factory: () => Promise<string | undefined> | string | undefined,
		shouldStop?: () => boolean,
	): Promise<void> {
		if (shouldStop?.()) {
			return;
		}
		try {
			const body = await factory();
			if (body?.trim()) {
				ranked.push({ id, title, body, priority });
			}
		} catch (err) {
			this._logService.warn(formatQuantumIDEWorkspaceDiscoveryLog({
				component: 'chat-context',
				operation: `section-${id}`,
				error: String(err),
			}));
		}
	}

	private _buildRecentlyViewedContext(): string | undefined {
		const recent = this._recentlyViewed.getRecent(12);
		if (recent.length === 0) {
			return undefined;
		}
		return recent.map(e => `- ${e.workspaceRelativePath ?? e.uri}`).join('\n');
	}

	/** M-34: declare MCP URI scheme in context inspector / prompt (tool-based discovery). */
	private _buildMcpResourcesContext(): string | undefined {
		const servers = this._mcpService.servers.get();
		if (!servers.length) {
			return undefined;
		}
		const lines: string[] = [
			'MCP resources use URI schemes such as mcp:// (not workspace file paths).',
			'Trust workspace before autostart; tools attach external context only when servers are enabled.',
		];
		for (const server of servers.slice(0, 16)) {
			const defs = server.readDefinitions().get();
			const label = defs?.server?.label ?? defs?.collection?.label ?? String(server.definition.id);
			const state = server.connectionState.get();
			const stateLabel = state?.state ?? 'stopped';
			lines.push(`- mcp://${encodeURIComponent(String(label))} (state=${stateLabel})`);
		}
		if (servers.length > 16) {
			lines.push(`- …${servers.length - 16} more MCP servers omitted`);
		}
		return lines.join('\n');
	}

	private async _buildGitBranchContext(): Promise<string | undefined> {
		const folder = this._folderWorkspaceService.getWorkspace().folders[0];
		if (!folder) {
			return undefined;
		}
		try {
			const head = (await this._fileService.readFile(joinPath(folder.uri, '.git', 'HEAD'))).value.toString().trim();
			if (head.startsWith('ref: refs/heads/')) {
				return head.slice('ref: refs/heads/'.length);
			}
			return `detached @ ${head.slice(0, 12)}`;
		} catch {
			return undefined;
		}
	}

	private async _buildFileHistoryContext(): Promise<string | undefined> {
		const editor = this._codeEditorService.getActiveCodeEditor();
		const resource = editor?.getModel()?.uri;
		if (!resource) {
			return undefined;
		}
		const entries = await this._workingCopyHistoryService.getEntries(resource, CancellationToken.None);
		if (entries.length === 0) {
			return undefined;
		}
		return entries.slice(-MAX_FILE_HISTORY_ENTRIES).map(entry => {
			const when = entry.timestamp ? new Date(entry.timestamp).toISOString() : 'unknown';
			return `- ${when}${entry.source ? ` (${entry.source})` : ''}`;
		}).join('\n');
	}

	private _buildOpenTabsContext(): string | undefined {
		const editors = this._editorService.editors.slice(0, MAX_OPEN_TABS);
		if (editors.length === 0) {
			return undefined;
		}
		return editors.map(editor => {
			const resource = editor.resource;
			if (!resource) {
				return `- ${editor.getName()}`;
			}
			const active = this._editorService.activeEditor === editor ? ' (active)' : '';
			return `- ${resource.fsPath}${active}`;
		}).join('\n');
	}

	private _buildTerminalContext(): string | undefined {
		const instances = this._terminalService.instances;
		if (instances.length === 0) {
			return undefined;
		}
		return instances.slice(0, 4).map(instance => {
			const title = instance.title;
			const cwd = instance.cwd;
			const active = this._terminalService.activeInstance === instance ? ' (active)' : '';
			return `- ${title}${cwd ? ` @ ${cwd}` : ''}${active}`;
		}).join('\n');
	}

	private _buildTerminalOutputContext(): string | undefined {
		const lines: string[] = [];
		for (const instance of this._terminalService.instances.slice(0, 2)) {
			const snippet = this._terminalOutputCache.get(instance.instanceId.toString());
			if (snippet?.trim()) {
				lines.push(`### ${instance.title}`, snippet);
			}
		}
		return lines.length ? lines.join('\n') : undefined;
	}

	private _buildNavigationHistoryContext(): string | undefined {
		const tracked = this._navigationHistory.formatForContext(MAX_NAVIGATION_ENTRIES);
		if (tracked) {
			return tracked;
		}
		const history = this._historyService.getHistory();
		if (history.length === 0) {
			return undefined;
		}
		return history.slice(0, MAX_NAVIGATION_ENTRIES).map(entry => {
			const resource = EditorResourceAccessor.getCanonicalUri(entry, { supportSideBySide: SideBySideEditor.PRIMARY });
			return resource ? `- ${resource.fsPath}` : `- ${'getName' in entry ? entry.getName() : 'editor'}`;
		}).join('\n');
	}

	private _buildLiveDiagnosticsContext(): string | undefined {
		const folder = this._folderWorkspaceService.getWorkspace().folders[0];
		if (!folder) {
			return undefined;
		}
		const activeResource = this._codeEditorService.getActiveCodeEditor()?.getModel()?.uri;
		const all = this._markerService.read({ severities: MarkerSeverity.Error | MarkerSeverity.Warning })
			.filter(m => m.resource.path.startsWith(folder.uri.path));
		all.sort((a, b) => {
			const aActive = activeResource && a.resource.toString() === activeResource.toString() ? 0 : 1;
			const bActive = activeResource && b.resource.toString() === activeResource.toString() ? 0 : 1;
			if (aActive !== bActive) {
				return aActive - bActive;
			}
			return MarkerSeverity.compare(a.severity, b.severity);
		});
		const markers = all.slice(0, MAX_LIVE_DIAGNOSTICS);
		if (markers.length === 0) {
			return undefined;
		}
		const omitted = all.length > markers.length ? `\n… and ${all.length - markers.length} more` : '';
		return markers.map(m => {
			const rel = m.resource.path.replace(folder.uri.path, '').replace(/^\//, '') || m.resource.fsPath;
			const sev = m.severity === MarkerSeverity.Error ? 'ERROR' : 'WARN';
			return `- [${sev}] ${rel}:${m.startLineNumber} ${m.message}${m.source ? ` (${m.source})` : ''}`;
		}).join('\n') + omitted;
	}

	private async _buildProjectManifestContext(): Promise<string | undefined> {
		const graph = this._quantumIDEWorkspaceContextService.getWorkspaceGraph();
		if (!graph || graph.manifests.length === 0) {
			return undefined;
		}
		const folder = this._folderWorkspaceService.getWorkspace().folders[0];
		if (!folder) {
			return undefined;
		}
		const requests = manifestNodesToSummaryRequests(graph.manifests.slice(0, 12));
		const summaries = [];
		for (const req of requests) {
			try {
				const content = (await this._fileService.readFile(joinPath(folder.uri, req.path))).value.toString();
				summaries.push(parseProjectManifestSummary(req.kind, req.path, content));
			} catch {
				summaries.push(parseProjectManifestSummary(req.kind, req.path, ''));
			}
		}
		const header = [`Workspace folders: ${graph.folders.map(f => f.name).join(', ')}`];
		for (const project of graph.projects.slice(0, 8)) {
			header.push(`- Monorepo package ${project.name || project.workspaceRelativePath} (${project.ecosystem})`);
		}
		return `${header.join('\n')}\n\n${formatProjectManifestSummaries(summaries)}`;
	}

	private _buildSelectionContext(): string | undefined {
		const editor = this._codeEditorService.getActiveCodeEditor();
		const model = editor?.getModel();
		const selection = editor?.getSelection();
		if (!model || !selection || selection.isEmpty()) {
			return undefined;
		}
		const text = model.getValueInRange(new Range(selection.startLineNumber, selection.startColumn, selection.endLineNumber, selection.endColumn));
		if (!text.trim()) {
			return undefined;
		}
		const relative = model.uri.fsPath;
		return `${basename(relative)}:${selection.startLineNumber}-${selection.endLineNumber}\n${text.slice(0, 4000)}`;
	}
}

registerSingleton(IQuantumIDEChatContextOrchestrator, QuantumIDEChatContextOrchestrator, InstantiationType.Delayed);
