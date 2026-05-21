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
import { assertWithinBudget, QuantumIDEPerformanceBudgetMs, runWithBudget } from '../../../../platform/quantumide/common/quantumidePerformanceBudgets.js';
import { formatDependencyGraphSummary } from '../../../../platform/quantumide/common/quantumideDependencyGraph.js';
import { formatDiagnosticsIndexSummary } from '../../../../platform/quantumide/common/quantumideIndexAugment.js';
import {
	formatProjectManifestSummaries,
	manifestNodesToSummaryRequests,
	parseProjectManifestSummary,
} from '../../../../platform/quantumide/common/quantumideProjectManifest.js';
import { formatRankedContext, rankAndTrimContextSections, type IQuantumIDEContextSection } from '../../../../platform/quantumide/common/quantumideContextRanker.js';
import { analyzeTerminalOutput, formatTerminalInsights } from '../../../../platform/quantumide/common/quantumideTerminalAnalysis.js';
import { QuantumIDEAISettingId } from '../../../../platform/quantumide/common/quantumideAISettings.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { EditorResourceAccessor, SideBySideEditor } from '../../../common/editor.js';
import { ITerminalService } from '../../../contrib/terminal/browser/terminal.js';
import { IEditorService } from '../../editor/common/editorService.js';
import { IHistoryService } from '../../history/common/history.js';
import { IWorkingCopyHistoryService } from '../../workingCopy/common/workingCopyHistory.js';
import { IQuantumIDEWorkspaceContextService } from '../common/quantumideWorkspaceContext.js';
import { IQuantumIDEChatContextBuildOptions, IQuantumIDEChatContextOrchestrator } from '../common/quantumideChatContext.js';
import { IQuantumIDEEditorStateService } from './quantumideEditorStateService.js';
import { IQuantumIDEContextExpansionService } from './quantumideContextExpansionService.js';
import { IQuantumIDELspSymbolIndexService } from '../common/quantumideLspSymbolIndex.js';
import { IQuantumIDESemanticIndexService } from '../common/quantumideSemanticIndex.js';
import { IQuantumIDEWorkspaceSymbolIndexService } from '../common/quantumideWorkspaceSymbolIndex.js';
import { IQuantumIDEContextHealthService } from '../common/quantumideContextHealth.js';
import { IQuantumIDEContextInspectorService } from '../common/quantumideContextInspector.js';
import { IQuantumIDENavigationHistoryService } from '../common/quantumideNavigationHistory.js';
import { ITextFileService } from '../../textfile/common/textfiles.js';

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
	) {
		super();
		if (this._configurationService.getValue<boolean>(QuantumIDEAISettingId.ChatSyncRealtime) !== false) {
			this._register(this._codeEditorService.onCodeEditorAdd(() => this._syncScheduler.schedule()));
			this._register(this._editorService.onDidActiveEditorChange(() => {
				this._syncScheduler.schedule();
				void this._lspSymbolIndexService.refreshActiveEditorSymbols();
			}));
			this._register(this._editorService.onDidCloseEditor(() => this._syncScheduler.schedule()));
			this._register(this._terminalService.onDidChangeActiveInstance(() => this._syncScheduler.schedule()));
			this._register(this._terminalService.onAnyInstanceData(e => {
				const key = e.instance.instanceId.toString();
				const prior = this._terminalOutputCache.get(key) ?? '';
				this._terminalOutputCache.set(key, (prior + e.data).slice(-MAX_TERMINAL_OUTPUT_CHARS));
				this._syncScheduler.schedule();
			}));
			this._register(this._markerService.onMarkerChanged(() => this._syncScheduler.schedule()));
			this._register(this._lspSymbolIndexService.onDidChangeSymbols(() => this._syncScheduler.schedule()));
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
		try {
			return await runWithBudget('chatContextBuild', QuantumIDEPerformanceBudgetMs.chatStartup, async () => {
			try {
			markQuantumIDEPerformanceStart(QuantumIDEPerformanceMark.ChatContextBuild);
			const tokenBudget = this._configurationService.getValue<number>(QuantumIDEAISettingId.ChatTokenBudget) ?? 12000;
			const ranked: IQuantumIDEContextSection[] = [];
			ranked.push({ id: 'workspace', title: '', body: await this._quantumIDEWorkspaceContextService.buildWorkspaceContext(options), priority: 100 });
			const editorState = this._editorStateService.formatEditorStateForContext();
			if (editorState) {
				ranked.push({ id: 'editor-state', title: 'Active editor state', body: editorState, priority: 96 });
			}
			const selection = this._buildSelectionContext();
			if (selection) {
				ranked.push({ id: 'selection', title: 'Active selection', body: selection, priority: 95 });
			}
			const branch = await this._buildGitBranchContext();
			if (branch && options.includeBranch !== false) {
				ranked.push({ id: 'branch', title: 'Git branch', body: branch, priority: 70 });
			}
			if (options.includeOpenTabs !== false) {
				const tabs = this._buildOpenTabsContext();
				if (tabs) {
					ranked.push({ id: 'tabs', title: 'Open tabs', body: tabs, priority: 65 });
				}
			}
			if (options.includeTerminal !== false) {
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
			const lspSymbols = await this._lspSymbolIndexService.getSymbolGraphPreview(30);
			if (lspSymbols.length > 0) {
				ranked.push({
					id: 'lsp-active',
					title: 'LSP symbol graph (active editor)',
					body: lspSymbols.map(s => `- ${s.name} (${s.kind}) line ${s.line}`).join('\n'),
					priority: 60,
				});
			}
			const wsSymbols = this._workspaceSymbolIndexService.getSymbols().slice(0, 35);
			if (wsSymbols.length > 0) {
				ranked.push({
					id: 'symbols-workspace',
					title: 'Workspace symbol index',
					body: wsSymbols.map(s => `- ${s.path}:${s.line} ${s.kind} ${s.name}`).join('\n'),
					priority: 55,
				});
			}
			const graph = this._semanticIndexService.getDependencyGraph();
			if (graph && graph.nodes.length > 0) {
				ranked.push({
					id: 'deps',
					title: `Dependency graph (${graph.nodes.length} nodes)`,
					body: formatDependencyGraphSummary(graph, 25),
					priority: 50,
				});
			}
			const liveDiagnostics = this._buildLiveDiagnosticsContext();
			if (liveDiagnostics) {
				ranked.push({
					id: 'diagnostics-live',
					title: 'Live diagnostics (errors & warnings)',
					body: liveDiagnostics,
					priority: 88,
				});
			}
			const diagnosticsIndex = this._semanticIndexService.getDiagnosticsIndex();
			if (diagnosticsIndex && diagnosticsIndex.entries.length > 0) {
				ranked.push({
					id: 'diagnostics-index',
					title: 'Indexed diagnostics',
					body: formatDiagnosticsIndexSummary(diagnosticsIndex, 15),
					priority: 85,
				});
			}
			const projectContext = await this._buildProjectManifestContext();
			if (projectContext) {
				ranked.push({
					id: 'project-manifests',
					title: 'Project manifests',
					body: projectContext,
					priority: 92,
				});
			}
			if (options.userQuery) {
				const expanded = await this._contextExpansionService.buildAutomaticExpansionSection(options.userQuery);
				if (expanded) {
					ranked.push({
						id: 'context-expansion',
						title: 'Auto-expanded related context',
						body: expanded,
						priority: 91,
					});
				}
			}
			const commentsIndex = this._semanticIndexService.getCommentsIndex();
			if (commentsIndex && commentsIndex.entries.length > 0) {
				const sample = commentsIndex.entries.slice(0, 12).map(c => `- ${c.path}:${c.line} ${c.text.slice(0, 80)}`).join('\n');
				ranked.push({
					id: 'comments-index',
					title: `Indexed comments (${commentsIndex.entries.length})`,
					body: sample,
					priority: 45,
				});
			}
			if (options.includeNavigationHistory !== false) {
				const navigation = this._buildNavigationHistoryContext();
				if (navigation) {
					ranked.push({ id: 'navigation', title: 'Editor navigation', body: navigation, priority: 40 });
				}
			}
			const fileHistory = await this._buildFileHistoryContext();
			if (fileHistory) {
				ranked.push({ id: 'file-history', title: 'File history', body: fileHistory, priority: 35 });
			}
			const { included, omitted } = rankAndTrimContextSections(ranked, tokenBudget);
			const omittedIds = new Set(omitted);
			const builtAt = Date.now();
			this._contextInspector.recordBuild(
				ranked.map(s => ({
					id: s.id,
					title: s.title || s.id,
					charCount: s.body.length,
					omitted: omittedIds.has(s.id),
					tokenEstimate: Math.ceil(s.body.length / 4),
					ageMs: 0,
					stale: false,
				})),
			);
			void builtAt;
			const elapsed = markQuantumIDEPerformanceEnd(QuantumIDEPerformanceMark.ChatContextBuild) ?? 0;
			assertWithinBudget('chatContextBuild', elapsed, QuantumIDEPerformanceBudgetMs.chatStartup);
			const body = formatRankedContext(included, omitted);
			this._contextHealth.recordSuccess(included.length, omitted.length, this._hasUnsavedEditorBuffers());
			return body;
			} catch (err) {
				this._contextHealth.recordFailure(String(err));
				throw err;
			}
		});
		} finally {
			const startupElapsed = markQuantumIDEPerformanceEnd(QuantumIDEPerformanceMark.ChatStartup) ?? 0;
			assertWithinBudget('chatStartup', startupElapsed, QuantumIDEPerformanceBudgetMs.chatStartup);
		}
	}

	private _hasUnsavedEditorBuffers(): boolean {
		for (const model of this._textFileService.files.models) {
			if (!model.isDisposed() && this._textFileService.isDirty(model.resource)) {
				return true;
			}
		}
		return false;
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
