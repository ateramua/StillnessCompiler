/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { $, append, clearNode } from '../../../../../../base/browser/dom.js';
import { IDisposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { QuantumIDEAICommandId } from '../../../../../../platform/quantumide/common/quantumideAISettings.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IQuantumIDEFileExplorerTreeNode } from '../../../../../services/quantumide/common/quantumideFileExplorerTree.js';
import type { IQuantumIDEChatContextCard } from '../../../../../services/quantumide/common/quantumideChatRichUi.js';
import type { IQuantumIDEChatThreadRecord } from '../../../../../services/quantumide/common/quantumideChatThreadStore.js';
import type { IQuantumIDEWorkspaceSnapshotDiff, IQuantumIDEWorkspaceTimelineEntry } from '../../../../../services/quantumide/common/quantumideWorkspaceSnapshot.js';
import type { IQuantumIDEWorkspaceStateMeta } from '../../../../../services/quantumide/common/quantumideWorkspaceState.js';
import type { IQuantumIDECollabSession, IQuantumIDECollabSyncState } from '../../../../../services/quantumide/common/quantumideCollaboration.js';
import { COLLAB_PRESENCE_STALE_MS } from '../../../../../services/quantumide/common/quantumideCollaboration.js';
import type { IQuantumIDEAgentTaskState } from '../../../../../services/quantumide/common/quantumideAgentTask.js';
import type { IQuantumIDEContextInspectorSection } from '../../../../../services/quantumide/common/quantumideContextInspector.js';
import type { IQuantumIDEChatPluginListing } from '../../../../../services/quantumide/common/quantumideChatPluginMarketplace.js';
import type { IQuantumIDEChatScmRepoState } from '../../../../../services/quantumide/common/quantumideChatScmPanel.js';
import type { IQuantumIDEChatTestResultItem, IQuantumIDEChatTestRunSummary } from '../../../../../services/quantumide/common/quantumideChatTestPanel.js';
import type { IQuantumIDEProjectEntry } from '../../../../../services/quantumide/common/quantumideProjectManager.js';
import type { IQuantumIDERefactorAction } from '../../../../../services/quantumide/common/quantumideRefactorWorkflow.js';
import type { IQuantumIDEOnboardingTip } from '../../../../../services/quantumide/browser/quantumideOnboardingService.js';
import {
	IParityTreeNode,
	renderParityActions,
	renderParityCard,
	renderParityEmptyState,
	renderParityErrorBanner,
	renderParityLoading,
} from './quantumideChatParityUi.js';
import { ParityVirtualTree, renderParityTreeFilterRow } from './quantumideParityVirtualTree.js';
import { IQuantumIDEFileExplorerTreeService } from '../../../../../services/quantumide/common/quantumideFileExplorerTree.js';

export function toParityTreeNodes(nodes: readonly IQuantumIDEFileExplorerTreeNode[]): readonly IParityTreeNode[] {
	return nodes.map(n => ({
		id: n.id,
		label: n.label,
		path: n.path,
		isDirectory: n.isDirectory,
		resourceUri: n.resourceUri,
		badge: n.badge,
		status: n.status,
		children: n.children ? toParityTreeNodes(n.children) : undefined,
	}));
}

export interface IDockSectionHost {
	readonly body: HTMLElement;
	register(disposable: IDisposable): void;
}

export function renderProjectsSection(
	host: IDockSectionHost,
	projects: readonly IQuantumIDEProjectEntry[],
	recent: readonly { uri: string; name: string; openedAt: number }[],
	busy: boolean,
	commandService: ICommandService,
): void {
	clearNode(host.body);
	if (busy) {
		renderParityLoading(host.body, localize('quantumide.parity.projects.loading', 'Updating workspace…'));
		return;
	}
	if (!projects.length) {
		renderParityEmptyState(host.body, localize('quantumide.parity.projects.empty', 'No workspace folders. Open or add a project to begin.'), [
			{ label: localize('quantumide.parity.projects.open', 'Open Folder'), command: 'workbench.action.files.openFolder' },
			{ label: localize('quantumide.parity.projects.add', 'Add Folder'), command: 'quantumide.chat.addWorkspaceFolder' },
			{ label: localize('quantumide.parity.projects.clone', 'Clone Repository'), command: 'git.clone' },
		], commandService, host.register);
		return;
	}
	const list = append(host.body, $('ul.quantumide-parity-tree'));
	for (const p of projects) {
		const li = append(list, $('li.quantumide-parity-tree-item.quantumide-parity-project-row'));
		append(li, $('span.quantumide-parity-project-name', {}, p.name + (p.isActive ? ' ★' : '')));
		if (p.error) {
			append(li, $('span.quantumide-parity-badge.quantumide-parity-status-error', {}, p.error));
		}
		const row = append(li, $('span.quantumide-parity-inline-actions'));
		renderParityActions(row, [
			{ label: localize('quantumide.parity.projects.reveal', 'Reveal'), command: 'revealInExplorer', args: [p.uri] },
			{ label: localize('quantumide.parity.projects.remove', 'Remove'), command: 'quantumide.chat.removeWorkspaceFolder', args: [p.uri] },
		], commandService, host.register);
	}
	if (recent.length) {
		append(host.body, $('p.quantumide-parity-subtitle', {}, localize('quantumide.parity.projects.recent', 'Recent')));
		const recentList = append(host.body, $('ul.quantumide-parity-tree'));
		for (const r of recent.slice(0, 6)) {
			const li = append(recentList, $('li.quantumide-parity-tree-item'));
			const btn = append(li, $('button.quantumide-parity-link', { type: 'button' }, r.name));
			btn.addEventListener('click', () => void commandService.executeCommand('vscode.openFolder', URI.parse(r.uri)));
			host.register({ dispose: () => btn.remove() });
		}
	}
	renderParityActions(host.body, [
		{ label: localize('quantumide.parity.projects.open', 'Open Folder'), command: 'quantumide.chat.openWorkspaceFolder' },
		{ label: localize('quantumide.parity.projects.add', 'Add Folder'), command: 'quantumide.chat.addWorkspaceFolder' },
	], commandService, host.register);
}

export function renderFileExplorerSection(
	host: IDockSectionHost,
	nodes: readonly IQuantumIDEFileExplorerTreeNode[],
	expanded: readonly string[],
	loading: boolean,
	error: string | undefined,
	filterQuery: string,
	commandService: ICommandService,
	fileTree: IQuantumIDEFileExplorerTreeService,
	onToggleExpand: (id: string, expanded: boolean) => void,
	onOpen: (node: IQuantumIDEFileExplorerTreeNode) => void,
	onFilterChange: (query: string) => void,
): ParityVirtualTree {
	clearNode(host.body);
	renderParityTreeFilterRow(host.body, filterQuery, onFilterChange, host.register);
	const treeHost = append(host.body, $('div.quantumide-parity-file-tree-host'));
	const tree = new ParityVirtualTree(
		treeHost,
		commandService,
		node => onOpen(node as unknown as IQuantumIDEFileExplorerTreeNode),
		(node, actions) => renderParityActions(host.body, actions, commandService, host.register),
		onToggleExpand,
	);
	tree.setOptions({
		filterQuery,
		onFilterChange,
		virtualized: true,
		onMove: async (sources, target) => {
			const result = await fileTree.moveEntries(sources, target);
			if (result.errors.length) {
				await commandService.executeCommand('quantumide.fileTree.refresh');
			}
		},
	});
	tree.setExpandedPaths(expanded);
	tree.setNodes(toParityTreeNodes(nodes), { loading, error });
	host.register(tree);
	return tree;
}

export function renderScmPanelSection(
	host: IDockSectionHost,
	repos: readonly IQuantumIDEChatScmRepoState[],
	commandService: ICommandService,
): void {
	clearNode(host.body);
	if (!repos.length) {
		renderParityEmptyState(host.body, localize('quantumide.parity.scm.empty', 'No source control providers.'), [
			{ label: localize('quantumide.parity.scm.open', 'Open SCM View'), command: 'workbench.view.scm' },
		], commandService, host.register);
		return;
	}
	for (const repo of repos) {
		const branchLine = repo.branch
			? localize('quantumide.parity.scm.branchLine', '{0} — {1}', repo.providerLabel, repo.branch)
			: repo.providerLabel;
		append(host.body, $('p.quantumide-parity-scm-head', {}, branchLine));
		if (repo.remoteBranch) {
			append(host.body, $('p.quantumide-parity-muted', {}, localize('quantumide.parity.scm.remote', 'Tracking {0}', repo.remoteBranch)));
		}
		if (repo.hasConflicts) {
			renderParityErrorBanner(host.body, localize('quantumide.parity.scm.conflicts', 'Merge conflicts detected. Resolve in SCM or use merge tools.'));
		}
		const list = append(host.body, $('ul.quantumide-parity-tree'));
		for (const file of repo.files.slice(0, 40)) {
			const li = append(list, $('li.quantumide-parity-tree-item'));
			li.classList.add(`quantumide-parity-status-${file.status}`);
			const btn = append(li, $('button.quantumide-parity-link', { type: 'button' }, `[${file.status}] ${file.path}`));
			btn.addEventListener('click', () => void commandService.executeCommand('git.openChange', file.uri));
			host.register({ dispose: () => btn.remove() });
		}
	}
	renderParityActions(host.body, [
		{ label: localize('quantumide.parityDock.stageAll', 'Stage All'), command: 'git.stageAll' },
		{ label: localize('quantumide.parityDock.commit', 'Commit'), command: 'git.commit' },
		{ label: localize('quantumide.parityDock.diff', 'Open SCM'), command: 'workbench.view.scm' },
		{ label: localize('quantumide.parityDock.switchBranch', 'Switch Branch'), command: 'git.checkout' },
	], commandService, host.register);
}

export function renderTestPanelSection(
	host: IDockSectionHost,
	run: IQuantumIDEChatTestRunSummary | undefined,
	filter: string,
	items: readonly IQuantumIDEChatTestResultItem[],
	commandService: ICommandService,
	onFilter: (value: string) => void,
): void {
	clearNode(host.body);
	if (run) {
		append(host.body, $('p', {}, localize('quantumide.parity.tests.summary', '{0} passed, {1} failed, {2} skipped', run.passed, run.failed, run.skipped)));
		if (run.running) {
			renderParityLoading(host.body, localize('quantumide.parity.tests.running', 'Tests running…'));
		}
	}
	const filterRow = append(host.body, $('.quantumide-parity-filter-row'));
	const input = append(filterRow, $('input.quantumide-parity-filter', {
		type: 'search',
		placeholder: localize('quantumide.parity.tests.filter', 'Filter tests…'),
		value: filter,
		'aria-label': localize('quantumide.parity.tests.filter', 'Filter tests'),
	})) as HTMLInputElement;
	input.addEventListener('input', () => onFilter(input.value));
	host.register({ dispose: () => input.remove() });

	const list = append(host.body, $('ul.quantumide-parity-tree'));
	for (const item of items.slice(0, 60)) {
		const li = append(list, $('li.quantumide-parity-tree-item'));
		li.classList.add(`quantumide-parity-status-${item.state}`);
		const label = `${item.state === 'failed' ? '✗' : item.state === 'passed' ? '✓' : '○'} ${item.label}`;
		const btn = append(li, $('button.quantumide-parity-link', { type: 'button', title: item.message ?? '' }, label));
		if (item.uri) {
			btn.addEventListener('click', () => void commandService.executeCommand('vscode.open', item.uri, {
				selection: item.line ? { startLineNumber: item.line, startColumn: 1, endLineNumber: item.line, endColumn: 1 } : undefined,
			}));
			host.register({ dispose: () => btn.remove() });
		}
	}
	renderParityActions(host.body, [
		{ label: localize('quantumide.parityDock.runAllTests', 'Run All Tests'), command: 'testing.runAll' },
		{ label: localize('quantumide.parityDock.rerunFailed', 'Re-run Failed'), command: 'testing.reRunFailTests' },
		{ label: localize('quantumide.parityDock.debugTest', 'Debug'), command: 'workbench.action.debug.start' },
	], commandService, host.register);
}

export function renderPluginMarketplaceSection(
	host: IDockSectionHost,
	plugins: readonly IQuantumIDEChatPluginListing[],
	search: string,
	commandService: ICommandService,
	onSearch: (q: string) => void,
	onToggle: (id: string, enabled: boolean) => void,
): void {
	clearNode(host.body);
	const filterRow = append(host.body, $('.quantumide-parity-filter-row'));
	const input = append(filterRow, $('input.quantumide-parity-filter', {
		type: 'search',
		placeholder: localize('quantumide.parity.plugins.search', 'Search plugins…'),
		value: search,
	})) as HTMLInputElement;
	input.addEventListener('input', () => onSearch(input.value));
	host.register({ dispose: () => input.remove() });

	const list = append(host.body, $('ul.quantumide-parity-tree'));
	for (const p of plugins.slice(0, 30)) {
		const li = append(list, $('li.quantumide-parity-tree-item'));
		append(li, $('span', {}, `${p.enabled ? '●' : '○'} ${p.name}`));
		append(li, $('span.quantumide-parity-muted', {}, p.description.slice(0, 80)));
		const row = append(li, $('span.quantumide-parity-inline-actions'));
		renderParityActions(row, [
			{ label: p.enabled ? localize('quantumide.parity.plugins.disable', 'Disable') : localize('quantumide.parity.plugins.enable', 'Enable'), command: 'quantumide.chat.togglePlugin', args: [p.id, !p.enabled] },
			...(p.installCommand ? [{ label: localize('quantumide.parity.plugins.manage', 'Manage'), command: p.installCommand }] : []),
		], commandService, host.register);
	}
	renderParityActions(host.body, [
		{ label: localize('quantumide.parity.plugins.browse', 'Browse Extensions'), command: 'workbench.view.extensions' },
		{ label: localize('quantumide.parity.plugins.settings', 'Plugin Settings'), command: 'quantumide.ai.managePlugins' },
	], commandService, host.register);
}

export function renderChatThreadsSection(
	host: IDockSectionHost,
	threads: readonly IQuantumIDEChatThreadRecord[],
	filter: string,
	commandService: ICommandService,
	onFilter: (value: string) => void,
	onPin: (id: string, pinned: boolean) => void,
): void {
	clearNode(host.body);
	const q = filter.trim().toLowerCase();
	const visible = threads.filter(t =>
		!q || t.title.toLowerCase().includes(q) || t.sessionResource.toLowerCase().includes(q),
	);
	const filterRow = append(host.body, $('.quantumide-parity-filter-row'));
	const input = append(filterRow, $('input.quantumide-parity-filter', {
		type: 'search',
		placeholder: localize('quantumide.parity.threads.filter', 'Search threads…'),
		value: filter,
		'aria-label': localize('quantumide.parity.threads.filter', 'Search threads'),
	})) as HTMLInputElement;
	input.addEventListener('input', () => onFilter(input.value));
	host.register({ dispose: () => input.remove() });

	if (!visible.length) {
		renderParityEmptyState(host.body, localize('quantumide.parity.threads.empty', 'No chat threads yet. Send a message in chat to create a persisted thread.'), [
			{ label: localize('quantumide.parity.threads.search', 'Search all threads'), command: 'quantumide.chat.searchThreads' },
		], commandService, host.register);
		return;
	}

	const list = append(host.body, $('ul.quantumide-parity-tree'));
	for (const thread of visible.slice(0, 40)) {
		const li = append(list, $('li.quantumide-parity-tree-item.quantumide-parity-thread-row'));
		const titleBtn = append(li, $('button.quantumide-parity-link', { type: 'button' }, `${thread.pinned ? '📌 ' : ''}${thread.title}`));
		titleBtn.addEventListener('click', () => void commandService.executeCommand('quantumide.chat.openThread', thread.sessionResource));
		host.register({ dispose: () => titleBtn.remove() });
		append(li, $('span.quantumide-parity-muted', {}, new Date(thread.updatedAt).toLocaleString()));
		if (thread.messageCount > 0) {
			append(li, $('span.quantumide-parity-badge', {}, String(thread.messageCount)));
		}
		const row = append(li, $('span.quantumide-parity-inline-actions'));
		renderParityActions(row, [
			{ label: thread.pinned ? localize('quantumide.parity.threads.unpin', 'Unpin') : localize('quantumide.parity.threads.pin', 'Pin'), command: 'quantumide.chat.pinThread', args: [thread.id, !thread.pinned] },
			{ label: localize('quantumide.parity.threads.branch', 'Branch'), command: 'quantumide.chat.branchThread', args: [thread.id, thread.sessionResource] },
		], commandService, host.register);
	}
	renderParityActions(host.body, [
		{ label: localize('quantumide.parity.threads.searchCmd', 'Search threads'), command: 'quantumide.chat.searchThreads' },
	], commandService, host.register);
}

export function renderRichUiSection(
	host: IDockSectionHost,
	cards: readonly IQuantumIDEChatContextCard[],
	commandService: ICommandService,
	onPin: (id: string, pinned: boolean) => void,
	onRemove: (id: string) => void,
): void {
	if (!cards.length) {
		renderParityEmptyState(host.body, localize('quantumide.parity.cards.empty', 'Context cards from chat, tests, and SCM appear here. Pin important items for multi-turn threads.'), [
			{ label: localize('quantumide.parity.cards.addSample', 'Add workspace context card'), command: 'quantumide.chat.addContextCard' },
		], commandService, host.register);
		return;
	}
	for (const card of cards.slice(0, 20)) {
		renderParityCard(
			host.body,
			(card.pinned ? '📌 ' : '') + card.title,
			card.body.slice(0, 400),
			[
				...(card.command ? [{ label: localize('quantumide.parity.cards.open', 'Open'), command: card.command, args: card.commandArgs ? [...card.commandArgs] : [] }] : []),
				{ label: card.pinned ? localize('quantumide.parity.cards.unpin', 'Unpin') : localize('quantumide.parity.cards.pin', 'Pin'), command: 'quantumide.chat.pinContextCard', args: [card.id, !card.pinned] },
				{ label: localize('quantumide.parity.cards.remove', 'Remove'), command: 'quantumide.chat.removeContextCard', args: [card.id] },
			],
			commandService,
			host.register,
		);
	}
}

export function renderRefactorSection(
	host: IDockSectionHost,
	refactors: readonly IQuantumIDERefactorAction[],
	commandService: ICommandService,
	onRun: (id: string, label: string) => void,
): void {
	clearNode(host.body);
	for (const r of refactors) {
		const row = append(host.body, $('.quantumide-parity-refactor-row'));
		append(row, $('strong', {}, r.label));
		append(row, $('p.quantumide-parity-muted', {}, r.description));
		const btn = append(row, $('button.quantumide-parity-action', { type: 'button' }, localize('quantumide.parity.refactor.run', 'Run')));
		btn.addEventListener('click', () => {
			onRun(r.id, r.label);
			void commandService.executeCommand(r.command);
		});
		host.register({ dispose: () => btn.remove() });
	}
}

export function renderContextualOnboardingSection(
	host: IDockSectionHost,
	tips: readonly IQuantumIDEOnboardingTip[],
	tourStep: number,
	commandService: ICommandService,
): void {
	clearNode(host.body);
	if (tourStep >= 0 && tourStep < WORKFLOW_TOUR_STEPS.length) {
		const step = WORKFLOW_TOUR_STEPS[tourStep];
		append(host.body, $('p.quantumide-parity-tour-step', {}, localize('quantumide.parity.tour.step', 'Tour step {0}/{1}', tourStep + 1, WORKFLOW_TOUR_STEPS.length)));
		append(host.body, $('p', {}, step));
	}
	for (const tip of tips) {
		append(host.body, $('p', {}, `**${tip.title}** — ${tip.body}`));
	}
	renderParityActions(host.body, [
		{ label: localize('quantumide.parity.tour.next', 'Next tip'), command: 'quantumide.chat.onboardingNext' },
		{ label: localize('quantumide.parity.tour.skip', 'Skip tour'), command: 'quantumide.chat.onboardingSkip' },
		{ label: localize('quantumide.parityDock.onboarding.tour', 'Full workflow tour'), command: 'quantumide.onboarding.workflowTour' },
	], commandService, host.register);
}

export function renderAgentTaskSection(
	host: IDockSectionHost,
	state: IQuantumIDEAgentTaskState,
	streaming: boolean,
	commandService: ICommandService,
): void {
	clearNode(host.body);
	if (state.status === 'idle' && !streaming) {
		renderParityEmptyState(host.body, localize('quantumide.parity.agentTask.empty', 'Agent task orchestration tracks plan steps, checkpoints, and rollback. Send a chat message or invoke the agent task tool to begin.'), [
			{ label: localize('quantumide.parity.agentTask.openChat', 'Focus chat'), command: 'workbench.action.chat.open' },
		], commandService, host.register);
		return;
	}
	append(host.body, $('p.quantumide-parity-agent-task-title', {}, state.title || localize('quantumide.parity.agentTask.untitled', 'Agent task')));
	if (state.planSummary) {
		append(host.body, $('p.quantumide-parity-muted', {}, state.planSummary));
	}
	const bar = append(host.body, $('.quantumide-parity-progress-track'));
	const fill = append(bar, $('.quantumide-parity-progress-fill'));
	fill.style.width = `${Math.min(100, state.progressPercent)}%`;
	append(host.body, $('p.quantumide-parity-muted', {}, localize('quantumide.parity.agentTask.statusLine', '{0} · {1}% · {2}', state.status, state.progressPercent, streaming ? localize('quantumide.parity.agentTask.streaming', 'streaming') : localize('quantumide.parity.agentTask.idle', 'idle'))));
	if (state.lastError) {
		renderParityErrorBanner(host.body, state.lastError);
	}
	const list = append(host.body, $('ol.quantumide-parity-agent-steps'));
	for (const step of state.steps) {
		const li = append(list, $('li.quantumide-parity-agent-step'));
		li.classList.add(`quantumide-parity-agent-step-${step.status}`);
		if (step.id === state.currentStepId) {
			li.classList.add('quantumide-parity-agent-step-current');
		}
		append(li, $('span.quantumide-parity-agent-step-label', {}, step.label));
		if (step.status === 'failed' && step.error) {
			append(li, $('span.quantumide-parity-muted', {}, step.error));
		}
		if (step.checkpointSnapshotId) {
			const row = append(li, $('span.quantumide-parity-inline-actions'));
			renderParityActions(row, [
				{ label: localize('quantumide.parity.agentTask.rollback', 'Rollback'), command: 'quantumide.agent.rollbackStep', args: [step.id] },
			], commandService, host.register);
		}
	}
	const canControl = state.status === 'running' || state.status === 'paused' || state.status === 'planning';
	renderParityActions(host.body, [
		{ label: localize('quantumide.parity.agentTask.pause', 'Pause'), command: 'quantumide.agent.pause', disabled: !canControl || state.status === 'paused' },
		{ label: localize('quantumide.parity.agentTask.resume', 'Resume'), command: 'quantumide.agent.resume', disabled: state.status !== 'paused' },
		{ label: localize('quantumide.parity.agentTask.abort', 'Abort'), command: 'quantumide.agent.abort', disabled: state.status === 'idle' || state.status === 'cancelled' },
		{ label: localize('quantumide.parity.agentTask.cancelChat', 'Cancel chat'), command: 'quantumide.chat.cancelStream', disabled: !streaming },
	], commandService, host.register);
}

export function renderCollaborationSection(
	host: IDockSectionHost,
	session: IQuantumIDECollabSession | undefined,
	sync: IQuantumIDECollabSyncState,
	localTransportOnly: boolean,
	offlineReplayPending: boolean,
	collabEnabled: boolean,
	commandService: ICommandService,
): void {
	clearNode(host.body);
	if (localTransportOnly) {
		append(host.body, $('p.quantumide-parity-muted', {}, localize('quantumide.parity.collab.localOnly', 'Local-folder sync (BroadcastChannel). For cross-machine live collab, enable a remote relay when available.')));
	}
	if (offlineReplayPending) {
		renderParityActions(host.body, [
			{ label: localize('quantumide.parity.collab.replay', 'Apply offline sync'), command: 'quantumide.collab.applyOfflineReplay' },
		], commandService, host.register);
	}
	append(host.body, $('p.quantumide-parity-collab-status', {}, localize('quantumide.parity.collab.status', 'Sync: {0}', sync.status)));
	if (sync.lastError) {
		renderParityErrorBanner(host.body, sync.lastError, {
			label: localize('quantumide.parity.collab.retry', 'Retry sync'),
			command: 'quantumide.collab.forceSync',
		}, commandService, host.register);
	}
	if (sync.conflict) {
		renderParityErrorBanner(host.body, localize('quantumide.parity.collab.conflict', 'Session conflict — choose a resolution.'), undefined, commandService, host.register);
		renderParityActions(host.body, [
			{ label: localize('quantumide.parity.collab.keepLocal', 'Keep local'), command: 'quantumide.collab.resolveConflict', args: ['local'] },
			{ label: localize('quantumide.parity.collab.keepRemote', 'Keep remote'), command: 'quantumide.collab.resolveConflict', args: ['remote'] },
			{ label: localize('quantumide.parity.collab.merge', 'Merge'), command: 'quantumide.collab.resolveConflict', args: ['merge'] },
		], commandService, host.register);
	}
	if (!session) {
		const collabActions = collabEnabled
			? [
				{ label: localize('quantumide.parity.collab.start', 'Start session (experimental)'), command: QuantumIDEAICommandId.CollabStartSession },
				{ label: localize('quantumide.parity.collab.join', 'Join session (experimental)'), command: QuantumIDEAICommandId.CollabJoinSession },
			]
			: [];
		renderParityEmptyState(
			host.body,
			collabEnabled
				? localize('quantumide.parity.collab.empty', 'No active collaboration session. Experimental: encrypted export + optional relay (no CRDT).')
				: localize('quantumide.parity.collab.disabled', 'Collaboration is off. Enable quantumide.chat.collab.enabled in settings for experimental session export.'),
			collabActions,
			commandService,
			host.register,
		);
		return;
	}
	append(host.body, $('p.quantumide-parity-muted', {}, localize('quantumide.parity.collab.sessionId', 'Session {0}', session.sessionId.slice(0, 8))));
	const now = Date.now();
	const list = append(host.body, $('ul.quantumide-parity-tree'));
	for (const p of session.participants) {
		const li = append(list, $('li.quantumide-parity-collab-participant'));
		const online = now - p.lastSeen < COLLAB_PRESENCE_STALE_MS;
		li.classList.toggle('quantumide-parity-collab-online', online);
		const presence = p.presence?.resource
			? ` @ ${p.presence.resource.split('/').pop() ?? ''}:${p.presence.line ?? ''}`
			: '';
		append(li, $('span', {}, `${online ? '●' : '○'} ${p.displayName}${presence}`));
	}
	const msgs = append(host.body, $('ul.quantumide-parity-collab-messages'));
	for (const m of session.messages.slice(-8)) {
		append(msgs, $('li', {}, `${m.authorName}: ${m.text.slice(0, 120)}`));
	}
	renderParityActions(host.body, [
		{ label: localize('quantumide.parity.collab.sync', 'Sync now'), command: 'quantumide.collab.forceSync' },
		{ label: localize('quantumide.parity.collab.leave', 'Leave'), command: 'quantumide.collab.leave' },
	], commandService, host.register);
}

export function renderSnapshotTimelineSection(
	host: IDockSectionHost,
	codeSnapshots: readonly import('../../../../../services/quantumide/common/quantumideWorkspaceSnapshot.js').IQuantumIDEWorkspaceSnapshotMeta[],
	sessionHistory: readonly IQuantumIDEWorkspaceStateMeta[],
	selectedId: string | undefined,
	diffPreview: IQuantumIDEWorkspaceSnapshotDiff | undefined,
	diffLoading: boolean,
	commandService: ICommandService,
	onSelect: (entry: IQuantumIDEWorkspaceTimelineEntry) => void,
): void {
	clearNode(host.body);
	const entries: IQuantumIDEWorkspaceTimelineEntry[] = [
		...codeSnapshots.map(s => ({
			kind: 'code-snapshot' as const,
			id: s.id,
			label: s.label,
			createdAt: s.createdAt,
			fileCount: s.fileCount,
		})),
		...sessionHistory.map(s => ({
			kind: 'workspace-session' as const,
			id: `session-${s.savedAt}`,
			label: s.label ?? localize('quantumide.parity.timeline.session', 'Workspace session'),
			createdAt: s.savedAt,
			fileCount: s.openFileCount,
			savedAt: s.savedAt,
		})),
	].sort((a, b) => b.createdAt - a.createdAt);

	if (!entries.length) {
		renderParityEmptyState(host.body, localize('quantumide.parity.timeline.empty', 'No snapshots or saved sessions yet. Create a snapshot before large refactors.'), [
			{ label: localize('quantumide.parity.timeline.create', 'Create snapshot'), command: 'quantumide.workspace.createSnapshot' },
			{ label: localize('quantumide.parity.timeline.saveSession', 'Save session'), command: 'quantumide.workspace.saveSession' },
		], commandService, host.register);
		return;
	}

	const timeline = append(host.body, $('ol.quantumide-parity-timeline', { role: 'list' }));
	for (const entry of entries.slice(0, 30)) {
		const li = append(timeline, $('li.quantumide-parity-timeline-item'));
		if (entry.id === selectedId) {
			li.classList.add('quantumide-parity-timeline-selected');
		}
		append(li, $('span.quantumide-parity-timeline-dot', {}, entry.kind === 'code-snapshot' ? '●' : '◆'));
		const row = append(li, $('.quantumide-parity-timeline-row'));
		const headBtn = append(row, $('button.quantumide-parity-timeline-head', { type: 'button' }, entry.label));
		headBtn.addEventListener('click', () => onSelect(entry));
		host.register({ dispose: () => headBtn.remove() });
		append(row, $('span.quantumide-parity-timeline-meta', {}, new Date(entry.createdAt).toLocaleString()));
		append(row, $('span.quantumide-parity-badge', {}, entry.kind === 'code-snapshot'
			? localize('quantumide.parity.timeline.code', '{0} files', entry.fileCount)
			: localize('quantumide.parity.timeline.layout', 'layout')));

		const actions = append(li, $('.quantumide-parity-timeline-actions'));
		if (entry.kind === 'code-snapshot') {
			renderParityActions(actions, [
				{ label: localize('quantumide.parity.timeline.restore', 'Restore'), command: 'quantumide.workspace.restoreSnapshot', args: [entry.id] },
				{ label: localize('quantumide.parity.timeline.delete', 'Delete'), command: 'quantumide.workspace.deleteSnapshot', args: [entry.id] },
			], commandService, host.register);
		} else if (entry.savedAt !== undefined) {
			renderParityActions(actions, [
				{ label: localize('quantumide.parity.timeline.restoreSession', 'Restore session'), command: 'quantumide.workspace.restoreSession', args: [entry.savedAt] },
			], commandService, host.register);
		}
	}

	const preview = append(host.body, $('.quantumide-parity-timeline-preview'));
	if (diffLoading) {
		renderParityLoading(preview, localize('quantumide.parity.timeline.diffLoading', 'Computing diff…'));
	} else if (diffPreview) {
		append(preview, $('p.quantumide-parity-timeline-diff-summary', {}, diffPreview.summary));
		const list = append(preview, $('ul.quantumide-parity-timeline-diff-list'));
		for (const file of diffPreview.changedFiles.filter(f => f.kind !== 'unchanged').slice(0, 40)) {
			const li = append(list, $('li'));
			li.classList.add(`quantumide-parity-timeline-diff-${file.kind}`);
			append(li, $('span', {}, `${file.kind === 'modified' ? '~' : '+'} ${file.path}`));
		}
	}

	renderParityActions(host.body, [
		{ label: localize('quantumide.parity.timeline.createSnap', 'New snapshot'), command: 'quantumide.workspace.createSnapshot' },
	], commandService, host.register);
}

export function renderAiWorkflowsSection(
	host: IDockSectionHost,
	contextState: string,
	contextError: string | undefined,
	streaming: boolean,
	threadCount: number,
	snapshotCount: number,
	sessionSavedAt: number | undefined,
	sessionFileCount: number | undefined,
	contextSections: readonly IQuantumIDEContextInspectorSection[],
	contextBuiltAt: number | undefined,
	offline: boolean,
	indexProgress: { busy: boolean; percent?: number; indexedFiles: number } | undefined,
	commandService: ICommandService,
): void {
	clearNode(host.body);
	if (offline) {
		append(host.body, $('p.quantumide-parity-offline-banner', {}, localize('quantumide.parity.offline', 'Offline — AI and sync features are limited until you reconnect.')));
	}
	if (indexProgress?.busy) {
		renderParityLoading(host.body, indexProgress.percent !== undefined
			? localize('quantumide.parity.indexingPercent', 'Indexing {0}% ({1} files)', indexProgress.percent, indexProgress.indexedFiles)
			: localize('quantumide.parity.indexing', 'Indexing workspace…'));
	}
	if (sessionSavedAt) {
		append(host.body, $('p.quantumide-parity-muted', {}, localize(
			'quantumide.parity.ai.session',
			'Last session: {0} ({1} files)',
			new Date(sessionSavedAt).toLocaleString(),
			sessionFileCount ?? 0,
		)));
	}
	append(host.body, $('p', {}, localize('quantumide.parity.ai.context', 'Context: {0}', contextState)));
	if (contextError) {
		renderParityErrorBanner(host.body, contextError, {
			label: localize('quantumide.parity.ai.reload', 'Reload context'),
			command: 'quantumide.chat.reloadContext',
		}, commandService, host.register);
	}
	if (streaming) {
		renderParityLoading(host.body, localize('quantumide.parity.ai.streaming', 'AI response streaming…'));
	}
	append(host.body, $('p.quantumide-parity-muted', {}, localize('quantumide.parity.ai.meta', '{0} thread(s) · {1} snapshot(s)', threadCount, snapshotCount)));
	if (contextSections.length) {
		const inspector = append(host.body, $('.quantumide-parity-context-inspector'));
		if (contextBuiltAt) {
			append(inspector, $('p.quantumide-parity-muted', {}, localize('quantumide.parity.contextBuilt', 'Context built {0}', new Date(contextBuiltAt).toLocaleTimeString())));
		}
		for (const section of contextSections) {
			const row = append(inspector, $('.quantumide-parity-context-section-row'));
			append(row, $('span', {}, section.title));
			const meta = append(row, $('span.quantumide-parity-muted', {}, `${section.charCount} chars`));
			if (section.omitted) {
				meta.classList.add('quantumide-parity-context-section-omitted');
				meta.textContent += ' · ' + localize('quantumide.parity.contextOmitted', 'omitted');
			}
		}
	}
	renderParityActions(host.body, [
		{ label: localize('quantumide.parity.ai.cancel', 'Cancel response'), command: 'quantumide.chat.cancelStream', disabled: !streaming },
		{ label: localize('quantumide.parity.ai.reloadCtx', 'Reload context'), command: 'quantumide.chat.reloadContext' },
		{ label: localize('quantumide.parity.ai.searchThreads', 'Search threads'), command: 'quantumide.chat.searchThreads' },
		{ label: localize('quantumide.parity.ai.snapshot', 'Create snapshot'), command: 'quantumide.workspace.createSnapshot' },
		{ label: localize('quantumide.parity.ai.saveSession', 'Save session'), command: 'quantumide.workspace.saveSession' },
		{ label: localize('quantumide.parity.ai.restoreSession', 'Restore session'), command: 'quantumide.workspace.restoreSession' },
		{ label: localize('quantumide.parity.ai.reviewEdits', 'Review pending edits'), command: QuantumIDEAICommandId.ChatReviewPendingEdits },
	], commandService, host.register);
}

const WORKFLOW_TOUR_STEPS = [
	'Open a folder to unlock workspace tree, tests, and SCM in chat.',
	'Use the file explorer to open files; right-click for context actions.',
	'Run refactorings from Symbols & Refactoring with LSP preview.',
	'Run tests and click failures to jump to code.',
	'Stage and commit from Source Control when ready.',
];
