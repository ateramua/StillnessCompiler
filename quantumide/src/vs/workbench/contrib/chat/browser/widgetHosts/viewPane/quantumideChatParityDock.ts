/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { $, append, clearNode } from '../../../../../../base/browser/dom.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { Event } from '../../../../../../base/common/event.js';
import { RunOnceScheduler } from '../../../../../../base/common/async.js';
import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { basename } from '../../../../../../base/common/path.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IMarkerService } from '../../../../../../platform/markers/common/markers.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { formatDependencyGraphSummary } from '../../../../../../platform/quantumide/common/quantumideDependencyGraph.js';
import { IWorkspaceContextService, WorkbenchState } from '../../../../../../platform/workspace/common/workspace.js';
import { inlineSuggestCommitId, hideInlineCompletionId, showNextInlineSuggestionActionId, showPreviousInlineSuggestionActionId } from '../../../../../../editor/contrib/inlineCompletions/browser/controller/commandIds.js';
import { ISCMService } from '../../../../scm/common/scm.js';
import { ITestResultService } from '../../../../testing/common/testResultService.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { IQuantumIDEWorkspaceContextService } from '../../../../../services/quantumide/common/quantumideWorkspaceContext.js';
import { IQuantumIDESemanticIndexService } from '../../../../../services/quantumide/common/quantumideSemanticIndex.js';
import { IQuantumIDEInlineDiffService } from '../../../../../services/quantumide/browser/quantumideInlineDiffService.js';
import { IQuantumIDEChatEditSessionService } from '../../../../../services/quantumide/browser/quantumideChatEditSessionService.js';
import { QuantumIDEChatPanelParityViewId } from '../../../../../browser/quantumideChatPanelParityViews.js';
import { IQuantumIDEProjectManagerService } from '../../../../../services/quantumide/common/quantumideProjectManager.js';
import { IQuantumIDEFileExplorerTreeService } from '../../../../../services/quantumide/common/quantumideFileExplorerTree.js';
import { IQuantumIDERefactorWorkflowService } from '../../../../../services/quantumide/common/quantumideRefactorWorkflow.js';
import { IQuantumIDEChatTestPanelService } from '../../../../../services/quantumide/common/quantumideChatTestPanel.js';
import { IQuantumIDEChatScmPanelService } from '../../../../../services/quantumide/common/quantumideChatScmPanel.js';
import { IQuantumIDEChatPluginMarketplaceService } from '../../../../../services/quantumide/common/quantumideChatPluginMarketplace.js';
import { IQuantumIDEChatRichUiService } from '../../../../../services/quantumide/common/quantumideChatRichUi.js';
import { IQuantumIDEOnboardingService, type QuantumIDEOnboardingContext } from '../../../../../services/quantumide/browser/quantumideOnboardingService.js';
import { IQuantumIDEFileNavigationService } from '../../../../../services/quantumide/browser/quantumideFileNavigationService.js';
import { IQuantumIDEContextHealthService } from '../../../../../services/quantumide/common/quantumideContextHealth.js';
import { IQuantumIDEChatThreadStoreService } from '../../../../../services/quantumide/common/quantumideChatThreadStore.js';
import { IQuantumIDEWorkspaceSnapshotService } from '../../../../../services/quantumide/common/quantumideWorkspaceSnapshot.js';
import { IQuantumIDEWorkspaceStateService } from '../../../../../services/quantumide/common/quantumideWorkspaceState.js';
import { IQuantumIDECollaborationService } from '../../../../../services/quantumide/common/quantumideCollaboration.js';
import { IQuantumIDEAgentTaskOrchestratorService } from '../../../../../services/quantumide/common/quantumideAgentTask.js';
import { IQuantumIDEContextInspectorService } from '../../../../../services/quantumide/common/quantumideContextInspector.js';
import { IQuantumIDEOfflineService } from '../../../../../services/quantumide/common/quantumidePlatformOps.js';
import { IQuantumIDEBackgroundIndexerService } from '../../../../../services/quantumide/browser/quantumideBackgroundIndexerService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { QuantumIDEAISettingId } from '../../../../../../platform/quantumide/common/quantumideAISettings.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import {
	renderAgentTaskSection,
	renderAiWorkflowsSection,
	renderCollaborationSection,
	renderSnapshotTimelineSection,
	renderChatThreadsSection,
	renderContextualOnboardingSection,
	renderFileExplorerSection,
	renderPluginMarketplaceSection,
	renderProjectsSection,
	renderRefactorSection,
	renderRichUiSection,
	renderScmPanelSection,
	renderTestPanelSection,
} from './quantumideChatParityDockSections.js';

type QuickAction = { label: string; command: string; args?: unknown[] };

const INLINE_SUGGEST_TRIGGER_ID = 'editor.action.inlineSuggest.trigger';

interface ISection {
	readonly root: HTMLElement;
	readonly body: HTMLElement;
}

export class QuantumIDEChatParityDock extends Disposable {
	private readonly _el: HTMLElement;
	private readonly _onboarding: ISection;
	private readonly _projects: ISection;
	private readonly _fileExplorer: ISection;
	private readonly _richUi: ISection;
	private readonly _aiWorkflows: ISection;
	private readonly _agentTask: ISection;
	private readonly _snapshotTimeline: ISection;
	private readonly _collaboration: ISection;
	private readonly _workspaceTree: ISection;
	private _pluginSearch = '';
	private _threadFilter = '';
	private _fileTreeFilter = '';
	private _timelineSelectedId: string | undefined;
	private _timelineDiff: import('../../../../../services/quantumide/common/quantumideWorkspaceSnapshot.js').IQuantumIDEWorkspaceSnapshotDiff | undefined;
	private _timelineDiffLoading = false;
	private _streaming = false;
	private _graphRefreshRequested = false;
	private _renderGeneration = 0;
	private _parityUiReady = false;
	private readonly _renderScheduler = this._register(new RunOnceScheduler(() => void this._renderAll(), 500));
	private readonly _markerRefreshScheduler = this._register(new RunOnceScheduler(() => this._scheduleRender(), 800));
	private readonly _sectionDisposableStores = new Map<ISection, DisposableStore>();
	private readonly _copilot: ISection;
	private readonly _suggestion: ISection;
	private readonly _symbol: ISection;
	private readonly _testLint: ISection;
	private readonly _debug: ISection;
	private readonly _viz: ISection;
	private readonly _scmSection: ISection;
	private readonly _plugin: ISection;
	private readonly _docs: ISection;
	private readonly _guidance: ISection;

	constructor(
		parent: HTMLElement,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IQuantumIDEWorkspaceContextService private readonly _quantumWorkspaceContext: IQuantumIDEWorkspaceContextService,
		@IFileService private readonly _fileService: IFileService,
		@ICommandService private readonly _commandService: ICommandService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IEditorService private readonly _editorService: IEditorService,
		@IQuantumIDEInlineDiffService private readonly _inlineDiffService: IQuantumIDEInlineDiffService,
		@IQuantumIDEChatEditSessionService private readonly _chatEditSessionService: IQuantumIDEChatEditSessionService,
		@ITestResultService private readonly _testResults: ITestResultService,
		@IMarkerService private readonly _markers: IMarkerService,
		@ISCMService private readonly _scm: ISCMService,
		@IQuantumIDESemanticIndexService private readonly _semanticIndex: IQuantumIDESemanticIndexService,
		@IQuantumIDEProjectManagerService private readonly _projectManager: IQuantumIDEProjectManagerService,
		@IQuantumIDEFileExplorerTreeService private readonly _fileExplorerTree: IQuantumIDEFileExplorerTreeService,
		@IQuantumIDERefactorWorkflowService private readonly _refactorWorkflow: IQuantumIDERefactorWorkflowService,
		@IQuantumIDEChatTestPanelService private readonly _chatTests: IQuantumIDEChatTestPanelService,
		@IQuantumIDEChatScmPanelService private readonly _chatScm: IQuantumIDEChatScmPanelService,
		@IQuantumIDEChatPluginMarketplaceService private readonly _chatPlugins: IQuantumIDEChatPluginMarketplaceService,
		@IQuantumIDEChatRichUiService private readonly _chatRichUi: IQuantumIDEChatRichUiService,
		@IQuantumIDEOnboardingService private readonly _onboardingService: IQuantumIDEOnboardingService,
		@IQuantumIDEFileNavigationService private readonly _fileNav: IQuantumIDEFileNavigationService,
		@IQuantumIDEContextHealthService private readonly _contextHealth: IQuantumIDEContextHealthService,
		@IQuantumIDEChatThreadStoreService private readonly _chatThreads: IQuantumIDEChatThreadStoreService,
		@IQuantumIDEWorkspaceSnapshotService private readonly _snapshots: IQuantumIDEWorkspaceSnapshotService,
		@IQuantumIDEWorkspaceStateService private readonly _workspaceState: IQuantumIDEWorkspaceStateService,
		@IQuantumIDECollaborationService private readonly _collaborationService: IQuantumIDECollaborationService,
		@IQuantumIDEAgentTaskOrchestratorService private readonly _agentTasks: IQuantumIDEAgentTaskOrchestratorService,
		@IQuantumIDEContextInspectorService private readonly _contextInspector: IQuantumIDEContextInspectorService,
		@IQuantumIDEOfflineService private readonly _offline: IQuantumIDEOfflineService,
		@IQuantumIDEBackgroundIndexerService private readonly _backgroundIndexer: IQuantumIDEBackgroundIndexerService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IChatService private readonly _chatService: IChatService,
		@IInstantiationService _instantiationService: IInstantiationService,
	) {
		super();
		this._el = append(parent, $('.quantumide-chat-parity-dock'));
		// Onboarding first: matches focused empty-workbench flows (Cursor-like).
		this._onboarding = this._createSection(localize('quantumide.parityDock.onboarding', 'Get started'), false);
		this._projects = this._createSection(localize('quantumide.parityDock.projects', 'Projects & Workspace'), true);
		this._fileExplorer = this._createSection(localize('quantumide.parityDock.fileExplorer', 'File Explorer'), true);
		this._richUi = this._createSection(localize('quantumide.parityDock.richUi', 'Context & History'), false);
		this._aiWorkflows = this._createSection(localize('quantumide.parityDock.aiWorkflows', 'AI Chat Workflows'), true);
		this._agentTask = this._createSection(localize('quantumide.parityDock.agentTask', 'Agent Task Orchestration'), true);
		this._snapshotTimeline = this._createSection(localize('quantumide.parityDock.timeline', 'Snapshots & Timeline'), true);
		this._collaboration = this._createSection(localize('quantumide.parityDock.collaboration', 'Collaboration & Sync'), false);
		this._workspaceTree = this._createSection(localize('quantumide.parityDock.workspace', 'Manifests'), false);
		this._copilot = this._createSection(localize('quantumide.parityDock.copilot', 'Inline completion (editor)'), false);
		this._suggestion = this._createSection(localize('quantumide.parityDock.suggestions', 'Inline Suggestions & Batch Edits'), false);
		this._symbol = this._createSection(localize('quantumide.parityDock.symbols', 'Symbols & Refactoring'), false);
		this._testLint = this._createSection(localize('quantumide.parityDock.testlint', 'Tests & Lint Status'), false);
		this._debug = this._createSection(localize('quantumide.parityDock.debug', 'Debug Session'), false);
		this._viz = this._createSection(localize('quantumide.parityDock.viz', 'Dependency snapshot'), false);
		this._scmSection = this._createSection(localize('quantumide.parityDock.scm', 'Source Control'), false);
		this._plugin = this._createSection(localize('quantumide.parityDock.plugins', 'Plugins & Extensions'), false);
		this._docs = this._createSection(localize('quantumide.parityDock.docs', 'Contextual Documentation'), false);
		this._guidance = this._createSection(localize('quantumide.parityDock.guidance', 'Guidance'), false);

		for (const section of [
			this._onboarding, this._projects, this._fileExplorer, this._richUi, this._aiWorkflows,
			this._agentTask, this._snapshotTimeline, this._collaboration, this._workspaceTree,
			this._copilot, this._suggestion, this._symbol, this._testLint, this._debug, this._viz,
			this._scmSection, this._plugin, this._docs, this._guidance,
		]) {
			const store = new DisposableStore();
			this._sectionDisposableStores.set(section, store);
			this._register(store);
		}

		const refresh = () => {
			if (!this._parityUiReady) {
				return;
			}
			this._scheduleRender();
		};
		const refreshMarkers = () => {
			if (!this._parityUiReady) {
				return;
			}
			this._markerRefreshScheduler.schedule();
		};
		this._register(new RunOnceScheduler(() => {
			this._parityUiReady = true;
			this._scheduleRender();
		}, 12_000)).schedule();
		this._register(this._workspaceContextService.onDidChangeWorkbenchState(refresh));
		this._register(this._workspaceContextService.onDidChangeWorkspaceFolders(refresh));
		this._register(this._quantumWorkspaceContext.onDidChangeGraph(refresh));
		this._register(this._semanticIndex.onDidChangeIndex(refresh));
		this._register(this._fileService.onDidFilesChange(refresh));
		this._register(this._inlineDiffService.onDidChangeProposal(refresh));
		this._register(this._chatEditSessionService.onDidChange(refresh));
		this._register(this._testResults.onResultsChanged(refresh));
		// Diagnostics change frequently while typing or switching editors; extra debounce.
		this._register(this._markers.onMarkerChanged(refreshMarkers));
		this._register(this._scm.onDidAddRepository(refresh));
		this._register(this._scm.onDidRemoveRepository(refresh));
		this._register(this._editorService.onDidActiveEditorChange(refresh));
		this._register(Event.any(this._editorService.onDidCloseEditor, this._editorService.onDidVisibleEditorsChange)(refresh));
		this._register(this._projectManager.onDidChange(refresh));
		this._register(this._fileExplorerTree.onDidChange(refresh));
		this._register(this._refactorWorkflow.onDidChange(refresh));
		this._register(this._chatTests.onDidChange(refresh));
		this._register(this._chatScm.onDidChange(refresh));
		this._register(this._chatPlugins.onDidChange(refresh));
		this._register(this._chatRichUi.onDidChange(refresh));
		this._register(this._contextHealth.onDidChange(refresh));
		this._register(this._chatThreads.onDidChange(refresh));
		this._register(this._workspaceState.onDidChange(refresh));
		this._register(this._snapshots.onDidChange(refresh));
		this._register(this._collaborationService.onDidChangeSession(refresh));
		this._register(this._collaborationService.onDidChangeSyncState(refresh));
		this._register(this._agentTasks.onDidChange(refresh));
		this._register(this._contextInspector.onDidChange(refresh));
		this._register(this._offline.onDidChange(refresh));
		this._register(this._backgroundIndexer.onDidChangeProgress(refresh));
		this._register(autorun(reader => {
			this._streaming = this._chatService.requestInProgressObs.read(reader);
			refresh();
		}));
	}

	private _scheduleRender(): void {
		this._renderScheduler.schedule();
	}

	private _clearSection(section: ISection): void {
		clearNode(section.body);
		this._sectionDisposableStores.get(section)?.clear();
	}

	private _sectionHost(section: ISection): { body: HTMLElement; register: (d: import('../../../../../../base/common/lifecycle.js').IDisposable) => void } {
		const store = this._sectionDisposableStores.get(section);
		return {
			body: section.body,
			register: d => store?.add(d),
		};
	}

	private _createSection(title: string, expanded: boolean): ISection {
		const root = append(this._el, $('section.quantumide-chat-parity-section'));
		const header = append(root, $('button.quantumide-chat-parity-section-title', { type: 'button' }, title));
		const body = append(root, $('.quantumide-chat-parity-section-body'));
		body.classList.toggle('collapsed', !expanded);
		this._register(Event.fromDOMEventEmitter(header, 'click')(() => {
			body.classList.toggle('collapsed');
		}));
		return { root, body };
	}

	private _setSectionHidden(section: ISection, hidden: boolean): void {
		section.root.classList.toggle('quantumide-chat-parity-section-hidden', hidden);
		section.root.toggleAttribute('aria-hidden', hidden);
	}

	private async _renderAll(): Promise<void> {
		const generation = ++this._renderGeneration;
		const hasWorkspace = this._workspaceContextService.getWorkbenchState() !== WorkbenchState.EMPTY;
		const activeUri = this._editorService.activeEditor?.resource;

		this._renderProjects(hasWorkspace);
		if (generation !== this._renderGeneration) {
			return;
		}
		await this._renderFileExplorer(hasWorkspace);
		if (generation !== this._renderGeneration) {
			return;
		}
		await this._renderWorkspaceTree(hasWorkspace);
		if (generation !== this._renderGeneration) {
			return;
		}
		this._renderRichUi(hasWorkspace);
		this._renderAiWorkflows(hasWorkspace);
		this._renderAgentTask(hasWorkspace);
		await this._renderSnapshotTimeline(hasWorkspace);
		if (generation !== this._renderGeneration) {
			return;
		}
		this._renderCollaboration(hasWorkspace);
		this._renderOnboarding(hasWorkspace);
		this._renderCopilot(hasWorkspace, activeUri);
		this._renderSuggestionControls(hasWorkspace);
		this._renderSymbolAndRefactor(hasWorkspace, activeUri);
		this._renderTestLint(hasWorkspace, activeUri);
		this._renderDebug(hasWorkspace, activeUri);
		this._renderViz(hasWorkspace);
		this._renderSCM(hasWorkspace);
		this._renderPlugins(hasWorkspace, activeUri);
		await this._renderDocs(hasWorkspace, activeUri);
		if (generation !== this._renderGeneration) {
			return;
		}
		this._renderGuidance(hasWorkspace);

		if (generation === this._renderGeneration) {
			this._applySectionVisibility(hasWorkspace, activeUri);
		}
	}

	private _applySectionVisibility(hasWorkspace: boolean, activeUri: URI | undefined): void {
		const proposal = this._inlineDiffService.getActiveProposal();
		const pending = this._chatEditSessionService.getPendingCount();
		const batches = this._chatEditSessionService.getBatchIds();
		const showBatchPanel = hasWorkspace && (!!proposal || pending > 0 || batches.length > 0);

		const latest = this._testResults.results[0];
		const stats = this._markers.getStatistics();
		const activeDiags = activeUri ? this._markers.read({ resource: activeUri }).length : 0;
		const hasCoverage = !!(latest && latest.tasks.some(t => !!t.coverage.get()));
		const showTestLint = hasWorkspace && (!!latest || stats.errors > 0 || stats.warnings > 0 || activeDiags > 0 || hasCoverage);

		const depGraph = this._semanticIndex.getDependencyGraph();
		const showViz = hasWorkspace && !!depGraph && depGraph.nodes.length > 0;
		const showDebug = hasWorkspace && !!activeUri;

		const repos = [...this._scm.repositories];
		const showScm = hasWorkspace && repos.length > 0;

		const pluginCount = this._chatPlugins.getInstalled().length;
		const showPlugins = hasWorkspace && pluginCount > 0;
		const showRichUi = hasWorkspace && (this._chatRichUi.getCards().length > 0 || !this._onboardingService.hasCompletedOnboarding());

		const graph = this._quantumWorkspaceContext.getWorkspaceGraph();
		const readme = graph?.files.find(f => /readme(\.[a-z]+)?$/i.test(f.name));
		const showDocs = hasWorkspace && (!!readme || !!activeUri);

		const guidanceMessages = hasWorkspace && this._guidance.body.childNodes.length > 0;

		this._setSectionHidden(this._onboarding, hasWorkspace);
		this._setSectionHidden(this._projects, !hasWorkspace);
		this._setSectionHidden(this._fileExplorer, !hasWorkspace);
		this._setSectionHidden(this._richUi, !showRichUi);
		this._setSectionHidden(this._aiWorkflows, !hasWorkspace);
		const agentState = this._agentTasks.getState();
		const showAgentTask = hasWorkspace && (agentState.status !== 'idle' || this._streaming);
		this._setSectionHidden(this._agentTask, !showAgentTask);
		this._setSectionHidden(this._snapshotTimeline, !hasWorkspace);
		const collabEnabled = this._configurationService.getValue<boolean>(QuantumIDEAISettingId.ChatCollabEnabled) === true;
		const showCollab = hasWorkspace && (collabEnabled || !!this._collaborationService.getActiveSession());
		this._setSectionHidden(this._collaboration, !showCollab);
		this._setSectionHidden(this._workspaceTree, !hasWorkspace);
		this._setSectionHidden(this._copilot, !hasWorkspace || !activeUri);
		this._setSectionHidden(this._suggestion, !showBatchPanel);
		this._setSectionHidden(this._symbol, !hasWorkspace || !activeUri);
		this._setSectionHidden(this._testLint, !showTestLint);
		this._setSectionHidden(this._debug, !showDebug);
		this._setSectionHidden(this._viz, !showViz);
		this._setSectionHidden(this._scmSection, !showScm);
		this._setSectionHidden(this._plugin, !showPlugins);
		this._setSectionHidden(this._docs, !showDocs);
		this._setSectionHidden(this._guidance, !guidanceMessages);
	}

	private _renderProjects(hasWorkspace: boolean): void {
		this._clearSection(this._projects);
		if (!hasWorkspace) {
			return;
		}
		renderProjectsSection(
			this._sectionHost(this._projects),
			this._projectManager.getProjects(),
			this._projectManager.getRecentProjects(),
			this._projectManager.isBusy(),
			this._commandService,
		);
	}

	private async _renderFileExplorer(hasWorkspace: boolean): Promise<void> {
		this._clearSection(this._fileExplorer);
		if (!hasWorkspace) {
			return;
		}
		const filter = this._fileTreeFilter.trim();
		const nodes = filter.length >= 2
			? await this._fileExplorerTree.searchFlat(filter)
			: await this._fileExplorerTree.getRootNodes();
		renderFileExplorerSection(
			this._sectionHost(this._fileExplorer),
			nodes,
			this._fileExplorerTree.getExpandedPaths(),
			this._fileExplorerTree.isLoading(),
			this._fileExplorerTree.getLastError(),
			this._fileTreeFilter,
			this._commandService,
			this._fileExplorerTree,
			(id, expanded) => {
				this._fileExplorerTree.setExpanded(id, expanded);
				void this._fileExplorerTree.loadChildren(id).then(() => this._scheduleRender());
			},
			node => {
				if (node.resourceUri) {
					void this._openerService.open(node.resourceUri);
				} else {
					void this._fileNav.openFile(node.path);
				}
			},
			query => {
				this._fileTreeFilter = query;
				this._scheduleRender();
			},
		);
	}

	private _renderAgentTask(hasWorkspace: boolean): void {
		this._clearSection(this._agentTask);
		if (!hasWorkspace) {
			return;
		}
		renderAgentTaskSection(
			this._sectionHost(this._agentTask),
			this._agentTasks.getState(),
			this._streaming,
			this._commandService,
		);
	}

	private _renderCollaboration(hasWorkspace: boolean): void {
		this._clearSection(this._collaboration);
		if (!hasWorkspace) {
			return;
		}
		const collabEnabled = this._configurationService.getValue<boolean>(QuantumIDEAISettingId.ChatCollabEnabled) === true;
		renderCollaborationSection(
			this._sectionHost(this._collaboration),
			this._collaborationService.getActiveSession(),
			this._collaborationService.getSyncState(),
			this._collaborationService.isLocalTransportOnly(),
			this._collaborationService.hasOfflineReplayPending(),
			collabEnabled,
			this._commandService,
		);
	}

	private async _renderSnapshotTimeline(hasWorkspace: boolean): Promise<void> {
		this._clearSection(this._snapshotTimeline);
		if (!hasWorkspace) {
			return;
		}
		const snaps = await this._snapshots.listSnapshots();
		const sessions = await this._workspaceState.listHistory();
		renderSnapshotTimelineSection(
			this._sectionHost(this._snapshotTimeline),
			snaps,
			sessions,
			this._timelineSelectedId,
			this._timelineDiff,
			this._timelineDiffLoading,
			this._commandService,
			entry => {
				this._timelineSelectedId = entry.id;
				if (entry.kind === 'code-snapshot') {
					this._timelineDiffLoading = true;
					this._timelineDiff = undefined;
					this._scheduleRender();
					void this._snapshots.getSnapshotDiff(entry.id).then(diff => {
						this._timelineDiff = diff;
						this._timelineDiffLoading = false;
						this._scheduleRender();
					});
				} else {
					this._timelineDiff = undefined;
					this._timelineDiffLoading = false;
					this._scheduleRender();
				}
			},
		);
	}

	private _renderAiWorkflows(hasWorkspace: boolean): void {
		this._clearSection(this._aiWorkflows);
		if (!hasWorkspace) {
			return;
		}
		const snap = this._contextHealth.getSnapshot();
		const sessionMeta = this._workspaceState.getLastSavedMeta();
		void this._snapshots.listSnapshots().then(snaps => {
			renderAiWorkflowsSection(
				this._sectionHost(this._aiWorkflows),
				snap.state,
				snap.lastError,
				this._streaming,
				this._chatThreads.getThreads().length,
				snaps.length,
				sessionMeta?.savedAt,
				sessionMeta?.openFileCount,
				this._contextInspector.getSections(),
				this._contextInspector.getLastBuiltAt(),
				!this._offline.getState().online,
				this._backgroundIndexer.getProgress(),
				this._commandService,
			);
		});
	}

	private _renderRichUi(hasWorkspace: boolean): void {
		this._clearSection(this._richUi);
		if (!hasWorkspace) {
			return;
		}
		const host = this._sectionHost(this._richUi);
		renderChatThreadsSection(
			host,
			this._chatThreads.getThreads(),
			this._threadFilter,
			this._commandService,
			value => {
				this._threadFilter = value;
				this._scheduleRender();
			},
			(id, pinned) => this._chatThreads.pinThread(id, pinned),
		);
		append(this._richUi.body, $('p.quantumide-parity-subtitle', {}, localize('quantumide.parity.cards.title', 'Context cards')));
		renderRichUiSection(
			host,
			this._chatRichUi.getCards(),
			this._commandService,
			(id, pinned) => this._chatRichUi.pinCard(id, pinned),
			id => this._chatRichUi.removeCard(id),
		);
	}

	private async _renderWorkspaceTree(hasWorkspace: boolean): Promise<void> {
		this._clearSection(this._workspaceTree);
		if (!hasWorkspace) {
			return;
		}

		const graph = this._quantumWorkspaceContext.getWorkspaceGraph();
		const indexingEnabled = this._configurationService.getValue<boolean>(QuantumIDEAISettingId.IndexingEnabled) === true;
		if (!graph?.files.length && !this._graphRefreshRequested && indexingEnabled) {
			this._graphRefreshRequested = true;
			void this._quantumWorkspaceContext.refreshWorkspaceGraph('chat parity dock').then(() => this._scheduleRender());
			append(this._workspaceTree.body, $('p', {}, localize('quantumide.parity.workspaceIndexing', 'Building workspace index…')));
			return;
		}
		const manifests = graph?.manifests ?? [];

		const roots = append(this._workspaceTree.body, $('ul.quantumide-parity-tree'));
		for (const folder of this._workspaceContextService.getWorkspace().folders) {
			const li = append(roots, $('li.quantumide-parity-tree-root'));
			append(li, $('span.quantumide-parity-tree-label', {}, basename(folder.uri.fsPath) || folder.uri.fsPath));
		}

		const manifestList = append(this._workspaceTree.body, $('ul.quantumide-parity-tree'));
		for (const manifest of manifests.slice(0, 20)) {
			const li = append(manifestList, $('li.quantumide-parity-tree-item'));
			const btn = append(li, $('button.quantumide-parity-link', { type: 'button' }, manifest.workspaceRelativePath));
			this._sectionHost(this._workspaceTree).register(Event.fromDOMEventEmitter(btn, 'click')(() => this._openerService.open(URI.parse(manifest.uri))));
		}

	}

	private _renderOnboarding(hasWorkspace: boolean): void {
		this._clearSection(this._onboarding);
		if (hasWorkspace) {
			return;
		}
		append(this._onboarding.body, $('p', {}, localize('quantumide.parityDock.onboarding.empty', 'Open a folder or clone a repository to unlock chat-aware project actions.')));
		this._appendActions(this._onboarding.body, this._onboarding, [
			{ label: localize('quantumide.parityDock.onboarding.openFolder', 'Open Folder'), command: 'workbench.action.files.openFolder' },
			{ label: localize('quantumide.parityDock.cloneRepo', 'Clone Repository'), command: 'git.clone' },
			{ label: localize('quantumide.parityDock.onboarding.openRecent', 'Open Recent'), command: 'workbench.action.openRecent' },
			{ label: localize('quantumide.parityDock.onboarding.tour', 'Start Guided Tour'), command: 'quantumide.onboarding.workflowTour' },
		]);
	}

	private _renderCopilot(hasWorkspace: boolean, activeUri: URI | undefined): void {
		this._clearSection(this._copilot);
		if (!hasWorkspace || !activeUri) {
			return;
		}
		append(this._copilot.body, $('p', {}, localize('quantumide.parityDock.copilot.hint', 'Delegates to the active editor’s inline completion provider (built-in + extensions such as Copilot). Focus the editor first.')));
		this._appendActions(this._copilot.body, this._copilot, [
			{ label: localize('quantumide.parityDock.copilot.trigger', 'Trigger suggestions'), command: INLINE_SUGGEST_TRIGGER_ID },
			{ label: localize('quantumide.parityDock.copilot.accept', 'Accept'), command: inlineSuggestCommitId },
			{ label: localize('quantumide.parityDock.copilot.next', 'Next'), command: showNextInlineSuggestionActionId },
			{ label: localize('quantumide.parityDock.copilot.prev', 'Previous'), command: showPreviousInlineSuggestionActionId },
			{ label: localize('quantumide.parityDock.copilot.hide', 'Hide'), command: hideInlineCompletionId },
		]);
	}

	private _renderSuggestionControls(hasWorkspace: boolean): void {
		this._clearSection(this._suggestion);
		if (!hasWorkspace) {
			return;
		}
		const proposal = this._inlineDiffService.getActiveProposal();
		const pending = this._chatEditSessionService.getPendingCount();
		const batches = this._chatEditSessionService.getBatchIds();
		append(this._suggestion.body, $('p', {}, proposal
			? localize('quantumide.parityDock.suggestions.active', 'Inline suggestion active ({0} hunk(s)).', proposal.hunks.length)
			: localize('quantumide.parityDock.suggestions.none', 'No active inline suggestion.')));
		append(this._suggestion.body, $('p', {}, pending > 0
			? localize('quantumide.parityDock.suggestions.batch', '{0} pending staged chat edit(s).', pending)
			: localize('quantumide.parityDock.suggestions.batchNone', 'No pending staged chat edits.')));

		this._appendActions(this._suggestion.body, this._suggestion, [
			{ label: localize('quantumide.parityDock.accept', 'Accept'), command: 'quantumide.ai.inline.diffAccept' },
			{ label: localize('quantumide.parityDock.reject', 'Reject'), command: 'quantumide.ai.inline.diffReject' },
			{ label: localize('quantumide.parityDock.acceptAllBatch', 'Accept All Batches'), command: 'quantumide.chat.acceptPendingEdits' },
			{ label: localize('quantumide.parityDock.rejectBatch', 'Reject Batch'), command: 'quantumide.chat.reviewPendingEdits' },
		]);

		for (const batchId of batches) {
			const edits = this._chatEditSessionService.getPendingEditsForBatch(batchId);
			const batchContainer = append(this._suggestion.body, $('div.quantumide-parity-batch'));
			append(batchContainer, $('p', {}, localize('quantumide.parityDock.batchLabel', 'Batch {0}: {1} file(s)', batchId.replace('batch-', ''), edits.length)));
			this._appendActions(batchContainer, this._suggestion, [
				{ label: localize('quantumide.parityDock.batchAccept', 'Accept Batch'), command: 'quantumide.chat.acceptPendingBatchEdits', args: [batchId] },
				{ label: localize('quantumide.parityDock.batchReject', 'Reject Batch'), command: 'quantumide.chat.rejectPendingBatchEdits', args: [batchId] },
			]);

			const list = append(batchContainer, $('ul.quantumide-parity-tree'));
			for (const edit of edits) {
				const li = append(list, $('li.quantumide-parity-tree-item'));
				append(li, $('span', {}, edit.path));
				const actions = append(li, $('span.quantumide-parity-inline-actions'));
				this._appendActions(actions, this._suggestion, [
					{ label: localize('quantumide.parityDock.fileAccept', 'Accept'), command: 'quantumide.chat.acceptPendingEditById', args: [edit.id] },
					{ label: localize('quantumide.parityDock.fileReject', 'Reject'), command: 'quantumide.chat.rejectPendingEditById', args: [edit.id] },
				]);
			}
		}
	}

	private _renderSymbolAndRefactor(hasWorkspace: boolean, activeUri: URI | undefined): void {
		this._clearSection(this._symbol);
		if (!hasWorkspace || !activeUri) {
			return;
		}
		const selection = this._editorService.activeTextEditorControl?.getSelection();
		const hasSelection = !!selection && !selection.isEmpty();
		const refactors = this._refactorWorkflow.getAvailableRefactors(hasSelection, true);
		renderRefactorSection(
			this._sectionHost(this._symbol),
			refactors,
			this._commandService,
			(id, label) => this._refactorWorkflow.recordRefactorRun(id, label),
		);
		this._appendActions(this._symbol.body, this._symbol, [
			{ label: localize('quantumide.parityDock.gotoSymbol', 'Go to Symbol'), command: 'quantumide.chat.lsp.gotoWorkspaceSymbol' },
			{ label: localize('quantumide.parityDock.preview', 'Review pending edits'), command: 'quantumide.chat.reviewPendingEdits' },
		]);
	}

	private _renderTestLint(hasWorkspace: boolean, _activeUri: URI | undefined): void {
		if (!hasWorkspace) {
			this._clearSection(this._testLint);
			return;
		}
		this._clearSection(this._testLint);
		const run = this._chatTests.getLatestRun();
		const filter = this._chatTests.getFilter();
		let items = run?.items ?? [];
		if (filter.trim()) {
			const q = filter.toLowerCase();
			items = items.filter(i => i.label.toLowerCase().includes(q) || (i.message?.toLowerCase().includes(q) ?? false));
		}
		if (run) {
			renderTestPanelSection(
				this._sectionHost(this._testLint),
				run,
				filter,
				items,
				this._commandService,
				v => {
					this._chatTests.setFilter(v);
					this._scheduleRender();
				},
			);
		} else {
			const stats = this._markers.getStatistics();
			append(this._testLint.body, $('p', {}, localize('quantumide.parityDock.lint.stats', 'Problems: {0} errors, {1} warnings.', stats.errors, stats.warnings)));
			this._appendActions(this._testLint.body, this._testLint, [
				{ label: localize('quantumide.parityDock.runAllTests', 'Run All Tests'), command: 'testing.runAll' },
			]);
		}
	}

	private _renderViz(hasWorkspace: boolean): void {
		this._clearSection(this._viz);
		if (!hasWorkspace) {
			return;
		}
		const graph = this._semanticIndex.getDependencyGraph();
		if (!graph || graph.nodes.length === 0) {
			return;
		}
		const summary = formatDependencyGraphSummary(graph, 24);
		append(this._viz.body, $('pre.quantumide-parity-doc-snippet', {}, summary));
		this._appendActions(this._viz.body, this._viz, [
			{ label: localize('quantumide.parityDock.viz.openTree', 'Open dependency tree view'), command: `${QuantumIDEChatPanelParityViewId.Dependencies}.focus` },
		]);
	}

	private _renderDebug(hasWorkspace: boolean, activeUri: URI | undefined): void {
		this._clearSection(this._debug);
		if (!hasWorkspace || !activeUri) {
			return;
		}
		append(this._debug.body, $('p', {}, localize('quantumide.parityDock.debug.desc', 'Start and control debugging without leaving the chat panel.')));
		this._appendActions(this._debug.body, this._debug, [
			{ label: localize('quantumide.parityDock.debug.start', 'Start Debugging'), command: 'workbench.action.debug.start' },
			{ label: localize('quantumide.parityDock.debug.continue', 'Continue'), command: 'workbench.action.debug.continue' },
			{ label: localize('quantumide.parityDock.debug.stepOver', 'Step Over'), command: 'editor.debug.action.stepOver' },
			{ label: localize('quantumide.parityDock.debug.stepInto', 'Step Into'), command: 'editor.debug.action.stepInto' },
			{ label: localize('quantumide.parityDock.debug.stop', 'Stop'), command: 'workbench.action.debug.stop' },
			{ label: localize('quantumide.parityDock.debug.toggleBreakpoint', 'Toggle Breakpoint'), command: 'editor.debug.action.toggleBreakpoint' },
		]);
	}

	private _renderSCM(hasWorkspace: boolean): void {
		if (!hasWorkspace) {
			this._clearSection(this._scmSection);
			return;
		}
		this._clearSection(this._scmSection);
		this._chatScm.refresh();
		renderScmPanelSection(this._sectionHost(this._scmSection), this._chatScm.getRepositories(), this._commandService);
	}

	private _renderPlugins(hasWorkspace: boolean, _activeUri: URI | undefined): void {
		if (!hasWorkspace) {
			this._clearSection(this._plugin);
			return;
		}
		this._clearSection(this._plugin);
		const plugins = this._chatPlugins.search(this._pluginSearch);
		renderPluginMarketplaceSection(
			this._sectionHost(this._plugin),
			plugins,
			this._pluginSearch,
			this._commandService,
			q => {
				this._pluginSearch = q;
				this._scheduleRender();
			},
			(id, enabled) => this._chatPlugins.setEnabled(id, enabled),
		);
	}

	private async _renderDocs(hasWorkspace: boolean, activeUri: URI | undefined): Promise<void> {
		this._clearSection(this._docs);
		if (!hasWorkspace) {
			return;
		}
		const graph = this._quantumWorkspaceContext.getWorkspaceGraph();
		const readme = graph?.files.find(f => /readme(\.[a-z]+)?$/i.test(f.name));
		if (readme) {
			try {
				const content = (await this._fileService.readFile(URI.parse(readme.uri))).value.toString();
				const snippet = content.split(/\r?\n/).slice(0, 8).join('\n');
				append(this._docs.body, $('pre.quantumide-parity-doc-snippet', {}, snippet));
				this._appendActions(this._docs.body, this._docs, [
					{ label: localize('quantumide.parityDock.docs.openReadme', 'Open README'), command: 'vscode.open', args: [URI.parse(readme.uri)] },
				]);
			} catch {
				append(this._docs.body, $('p', {}, localize('quantumide.parityDock.docs.readmeErr', 'README found but could not be read.')));
			}
		}

		if (activeUri) {
			if (!readme) {
				append(this._docs.body, $('p', {}, localize('quantumide.parityDock.docs.activeOnly', 'Active file context')));
			}
			append(this._docs.body, $('p', {}, localize('quantumide.parityDock.docs.active', 'Active resource: {0}', activeUri.path)));
			this._appendActions(this._docs.body, this._docs, [
				{ label: localize('quantumide.parityDock.docs.symbol', 'Go to Symbol in Active File'), command: 'editor.action.goToSymbol' },
				{ label: localize('quantumide.parityDock.docs.peekDef', 'Peek Definition'), command: 'editor.action.peekDefinition' },
			]);
		}
	}

	private _renderGuidance(hasWorkspace: boolean): void {
		this._clearSection(this._guidance);
		if (!hasWorkspace) {
			return;
		}
		const contexts: QuantumIDEOnboardingContext[] = ['workspace-open'];
		const pendingEdits = this._chatEditSessionService.getPendingCount();
		if (pendingEdits > 0) {
			contexts.push('pending-edits');
		}
		const scmRepos = this._chatScm.getRepositories();
		if (scmRepos.some(r => r.files.length > 0)) {
			contexts.push('scm-dirty');
		}
		const run = this._chatTests.getLatestRun();
		if (run && run.failed > 0) {
			contexts.push('tests-failed');
		}
		const tips = contexts.flatMap(c => this._onboardingService.getContextualTips(c));
		renderContextualOnboardingSection(
			this._sectionHost(this._guidance),
			tips,
			this._onboardingService.getTourStep(),
			this._commandService,
		);
	}

	private _appendActions(container: HTMLElement, section: ISection, actions: QuickAction[]): void {
		const row = append(container, $('.quantumide-parity-actions'));
		const host = this._sectionHost(section);
		for (const action of actions) {
			const btn = append(row, $('button.quantumide-parity-action', { type: 'button' }, action.label));
			host.register(Event.fromDOMEventEmitter(btn, 'click')(async () => {
				try {
					await this._commandService.executeCommand(action.command, ...(action.args ?? []));
				} catch (err) {
					this._notificationService.error(localize('quantumide.parityDock.actionErr', 'Failed to run "{0}": {1}', action.label, String(err)));
				}
			}));
		}
	}

}
