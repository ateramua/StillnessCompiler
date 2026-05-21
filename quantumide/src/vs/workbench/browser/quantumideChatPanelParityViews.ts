/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { basename } from '../../base/common/path.js';
import { joinPath } from '../../base/common/resources.js';
import { URI } from '../../base/common/uri.js';
import { Disposable, MutableDisposable } from '../../base/common/lifecycle.js';
import { localize, localize2 } from '../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../platform/actions/common/actions.js';
import { IFileService } from '../../platform/files/common/files.js';
import { IInstantiationService, ServicesAccessor } from '../../platform/instantiation/common/instantiation.js';
import { SyncDescriptor } from '../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../platform/registry/common/platform.js';
import { IWorkspaceContextService } from '../../platform/workspace/common/workspace.js';
import { IWorkspaceEditingService } from '../services/workspaces/common/workspaceEditing.js';
import { TreeView, TreeViewPane } from './parts/views/treeView.js';
import { Extensions, ITreeItem, ITreeView, ITreeViewDataProvider, ITreeViewDescriptor, IViewsRegistry, TreeItemCollapsibleState, TreeViewItemHandleArg, ViewContainer } from '../common/views.js';
import { ContextKeyExpr } from '../../platform/contextkey/common/contextkey.js';
import { IQuantumIDEWorkspaceContextService } from '../services/quantumide/common/quantumideWorkspaceContext.js';
import { IQuantumIDESemanticIndexService } from '../services/quantumide/common/quantumideSemanticIndex.js';
import { QuantumIDEAICommandId } from '../../platform/quantumide/common/quantumideAISettings.js';
import { discoverTestsFromWorkspaceFiles } from '../../platform/quantumide/common/quantumideTestDiscovery.js';
import { IOpenerService } from '../../platform/opener/common/opener.js';
import { IQuickInputService } from '../../platform/quickinput/common/quickInput.js';
import { IQuantumIDEChatThreadStoreService } from '../services/quantumide/common/quantumideChatThreadStore.js';
import { IQuantumIDEFileExplorerTreeService } from '../services/quantumide/common/quantumideFileExplorerTree.js';

export const QUANTUMIDE_CHAT_PANEL_PARITY_CONTAINER_ID = 'quantumide.chatPanel.parity';

export const enum QuantumIDEChatPanelParityViewId {
	WorkspaceRoots = 'quantumide.chatPanel.workspaceRoots',
	NavigationHub = 'quantumide.chatPanel.navigationHub',
	ChatThreads = 'quantumide.chatPanel.chatThreads',
	WorkspaceFiles = 'quantumide.chatPanel.workspaceFiles',
	CodeSearch = 'quantumide.chatPanel.codeSearch',
	Tests = 'quantumide.chatPanel.tests',
	Dependencies = 'quantumide.chatPanel.dependencies',
	Marketplace = 'quantumide.chatPanel.marketplace',
}

function encodeWorkspaceFolderHandle(index: number, uri: URI): string {
	return JSON.stringify({ k: 'qparity-root', i: index, u: uri.toString() });
}

function decodeWorkspaceFolderHandle(handle: string): { index: number; uri: URI } | undefined {
	try {
		const o = JSON.parse(handle) as { k?: string; i?: number; u?: string };
		if (o?.k === 'qparity-root' && typeof o.i === 'number' && typeof o.u === 'string') {
			return { index: o.i, uri: URI.parse(o.u) };
		}
	} catch {
		return undefined;
	}
	return undefined;
}

class QuantumIDEParityWorkspaceRootsProvider extends Disposable implements ITreeViewDataProvider {
	constructor(
		private readonly _refresh: () => Promise<void>,
		@IWorkspaceContextService private readonly _workspace: IWorkspaceContextService,
	) {
		super();
		this._register(this._workspace.onDidChangeWorkspaceFolders(() => {
			void this._refresh();
		}));
	}

	async getChildren(element?: ITreeItem): Promise<readonly ITreeItem[] | undefined> {
		if (element) {
			return [];
		}
		return this._workspace.getWorkspace().folders.map((f, i) => ({
			handle: encodeWorkspaceFolderHandle(i, f.uri),
			collapsibleState: TreeItemCollapsibleState.None,
			label: { label: basename(f.uri.fsPath) || f.uri.fsPath },
			description: f.uri.fsPath,
			resourceUri: f.uri.toJSON(),
			contextValue: 'quantumideParityWorkspaceFolder',
		}));
	}
}

class QuantumIDEParityNavigationHubProvider implements ITreeViewDataProvider {
	async getChildren(element?: ITreeItem): Promise<readonly ITreeItem[] | undefined> {
		if (element) {
			return [];
		}
		const mk = (handle: string, label: string, codicon: string, command: string, tooltip: string): ITreeItem => ({
			handle,
			collapsibleState: TreeItemCollapsibleState.None,
			label: { label: `$(${codicon}) ${label}` },
			tooltip,
			command: { id: command, title: label },
		});
		return [
			mk('nav:files', localize('parity.nav.files', 'Quick Open (files)'), 'search', 'workbench.action.quickOpen', localize('parity.nav.files.tt', 'Native file quick open')),
			mk('nav:fuzzy', localize('parity.nav.fuzzy', 'QuantumIDE fuzzy files'), 'list-flat', QuantumIDEAICommandId.ParityFuzzyWorkspaceFiles, localize('parity.nav.fuzzy.tt', 'QuantumIDE fuzzy workspace file finder')),
			mk('nav:sym', localize('parity.nav.sym', 'Go to Symbol in Workspace'), 'symbol-class', 'workbench.action.gotoSymbol', localize('parity.nav.sym.tt', 'Workspace symbol picker')),
			mk('nav:symEd', localize('parity.nav.symEd', 'Go to Symbol in Editor'), 'symbol-method', 'editor.action.goToSymbol', localize('parity.nav.symEd.tt', 'Editor go to symbol')),
			mk('nav:def', localize('parity.nav.def', 'Go to Definition'), 'symbol-interface', 'editor.action.revealDefinition', localize('parity.nav.def.tt', 'LSP go to definition')),
			mk('nav:ref', localize('parity.nav.ref', 'Go to References'), 'references', 'editor.action.goToReferences', localize('parity.nav.ref.tt', 'Peek references')),
			mk('nav:scm', localize('parity.nav.scm', 'Source Control'), 'source-control', 'workbench.view.scm', localize('parity.nav.scm.tt', 'Integrated SCM view')),
			mk('nav:tests', localize('parity.nav.tests', 'Testing view'), 'beaker', 'workbench.view.testing', localize('parity.nav.tests.tt', 'Native test explorer')),
			mk('nav:timeline', localize('parity.nav.timeline', 'Timeline / file history'), 'history', 'timeline.focus', localize('parity.nav.timeline.tt', 'Timeline view')),
			mk('nav:problems', localize('parity.nav.problems', 'Problems panel'), 'warning', 'workbench.actions.view.problems', localize('parity.nav.problems.tt', 'Diagnostics')),
			mk('nav:ext', localize('parity.nav.ext', 'Extensions'), 'extensions', 'workbench.view.extensions', localize('parity.nav.ext.tt', 'Extensions view')),
			mk('nav:notif', localize('parity.nav.notif', 'Notifications'), 'bell', QuantumIDEAICommandId.ParityShowNotificationCenter, localize('parity.nav.notif.tt', 'Notification center')),
			mk('nav:blame', localize('parity.nav.blame', 'Toggle inline Git blame'), 'git-commit', 'git.blame.toggleEditorDecoration', localize('parity.nav.blame.tt', 'Git blame decorations')),
		];
	}
}

class QuantumIDEParityTestsProvider extends Disposable implements ITreeViewDataProvider {
	constructor(
		private readonly _refresh: () => Promise<void>,
		@IQuantumIDEWorkspaceContextService private readonly _ctx: IQuantumIDEWorkspaceContextService,
		@IWorkspaceContextService private readonly _workspace: IWorkspaceContextService,
		@IFileService private readonly _fileService: IFileService,
	) {
		super();
		this._register(this._ctx.onDidChangeGraph(() => { void this._refresh(); }));
	}

	private async readPackageScripts(): Promise<Record<string, string> | undefined> {
		const graph = this._ctx.getWorkspaceGraph();
		const pkg = graph?.files.find(f => f.workspaceRelativePath.endsWith('package.json'));
		if (!pkg?.uri) {
			return undefined;
		}
		try {
			const buf = await this._fileService.readFile(URI.parse(pkg.uri));
			const j = JSON.parse(buf.value.toString()) as { scripts?: Record<string, string> };
			return j.scripts && typeof j.scripts === 'object' ? j.scripts : undefined;
		} catch {
			return undefined;
		}
	}

	private _resolveRelPath(rel: string): URI | undefined {
		const folder = this._workspace.getWorkspace().folders[0];
		if (!folder) {
			return undefined;
		}
		const clean = rel.replace(/\\/g, '/').replace(/^\.\//, '');
		return joinPath(folder.uri, clean);
	}

	async getChildren(element?: ITreeItem): Promise<readonly ITreeItem[] | undefined> {
		if (element) {
			return [];
		}
		const graph = this._ctx.getWorkspaceGraph();
		const paths = graph?.files.map(f => f.workspaceRelativePath) ?? [];
		const scripts = await this.readPackageScripts();
		const discovered = discoverTestsFromWorkspaceFiles(paths, scripts);
		return discovered.tests.map(t => {
			const uri = t.path ? this._resolveRelPath(t.path) : undefined;
			return {
				handle: `test:${t.id}`,
				collapsibleState: TreeItemCollapsibleState.None,
				label: { label: t.label },
				description: t.runCommand,
				tooltip: t.runCommand ? localize('parity.test.tt', 'Suggested: {0}', t.runCommand) : undefined,
				contextValue: t.runCommand ? 'quantumideParityTestRunnable' : 'quantumideParityTest',
				command: uri
					? { id: 'vscode.open', title: localize('parity.openTest', 'Open file'), arguments: [uri] }
					: undefined,
			};
		});
	}
}

class QuantumIDEParityDependenciesProvider extends Disposable implements ITreeViewDataProvider {
	constructor(
		private readonly _refresh: () => Promise<void>,
		@IQuantumIDESemanticIndexService private readonly _semantic: IQuantumIDESemanticIndexService,
		@IQuantumIDEWorkspaceContextService private readonly _ctx: IQuantumIDEWorkspaceContextService,
	) {
		super();
		this._register(this._ctx.onDidChangeGraph(() => { void this._refresh(); }));
		this._register(this._semantic.onDidChangeIndex(() => { void this._refresh(); }));
	}

	async getChildren(element?: ITreeItem): Promise<readonly ITreeItem[] | undefined> {
		const graph = this._semantic.getDependencyGraph();
		if (!graph) {
			if (!element) {
				return [{
					handle: 'dep:empty',
					collapsibleState: TreeItemCollapsibleState.None,
					label: { label: localize('parity.deps.empty', 'Run indexing / open workspace to populate dependency graph') },
				}];
			}
			return [];
		}
		if (!element) {
			return graph.nodes
				.filter(n => n.kind === 'package')
				.map(n => ({
					handle: n.id,
					collapsibleState: n.dependencies.length ? TreeItemCollapsibleState.Collapsed : TreeItemCollapsibleState.None,
					label: { label: n.label },
					contextValue: 'quantumideParityDepPkg',
				}));
		}
		const node = graph.nodes.find(n => n.id === element.handle);
		if (!node) {
			return [];
		}
		return node.dependencies.map(depId => {
			const dep = graph.nodes.find(n => n.id === depId);
			const hasKids = dep && dep.dependencies.length > 0;
			return {
				handle: depId,
				collapsibleState: hasKids ? TreeItemCollapsibleState.Collapsed : TreeItemCollapsibleState.None,
				label: { label: dep?.label ?? depId.replace(/^pkg:/, '') },
				contextValue: 'quantumideParityDep',
			};
		});
	}
}

class QuantumIDEParityMarketplaceProvider implements ITreeViewDataProvider {
	async getChildren(element?: ITreeItem): Promise<readonly ITreeItem[] | undefined> {
		if (element) {
			return [];
		}
		const marketplaceUri = URI.parse('https://marketplace.visualstudio.com/vscode');
		return [
			{
				handle: 'mp:open-native',
				collapsibleState: TreeItemCollapsibleState.None,
				label: { label: localize('parity.mp.extensionsView', 'Extensions view (install / manage)') },
				command: { id: 'workbench.view.extensions', title: localize('parity.mp.extensionsView', 'Extensions view (install / manage)') },
			},
			{
				handle: 'mp:manage',
				collapsibleState: TreeItemCollapsibleState.None,
				label: { label: localize('parity.mp.quantumPlugins', 'QuantumIDE plugin settings') },
				command: { id: QuantumIDEAICommandId.ManagePlugins, title: localize('parity.mp.quantumPlugins', 'QuantumIDE plugin settings') },
			},
			{
				handle: 'mp:web',
				collapsibleState: TreeItemCollapsibleState.None,
				label: { label: localize('parity.mp.browser', 'VS Marketplace in browser') },
				tooltip: marketplaceUri.toString(),
				command: {
					id: '_quantumide.parity.openUri',
					title: localize('parity.mp.browser', 'VS Marketplace in browser'),
					arguments: [marketplaceUri],
				},
			},
		];
	}
}

class QuantumIDEParityChatThreadsProvider implements ITreeViewDataProvider {
	constructor(@IQuantumIDEChatThreadStoreService private readonly _threads: IQuantumIDEChatThreadStoreService) { }
	async getChildren(): Promise<readonly ITreeItem[]> {
		return this._threads.getThreads().map(t => ({
			handle: `thread:${t.id}`,
			collapsibleState: TreeItemCollapsibleState.None,
			label: { label: t.title || t.id },
			description: new Date(t.updatedAt).toLocaleString(),
			command: { id: 'quantumide.chat.openThread', title: t.title, arguments: [t.id] },
		}));
	}
}

class QuantumIDEParityWorkspaceFilesProvider extends Disposable implements ITreeViewDataProvider {
	constructor(
		private readonly _refresh: () => Promise<void>,
		@IQuantumIDEFileExplorerTreeService private readonly _tree: IQuantumIDEFileExplorerTreeService,
	) {
		super();
		this._register(this._tree.onDidChange(() => { void this._refresh(); }));
	}
	async getChildren(element?: ITreeItem): Promise<readonly ITreeItem[] | undefined> {
		if (!element) {
			const roots = await this._tree.getRootNodes();
			return roots.map(n => this._nodeItem(n));
		}
		const id = element.handle;
		const children = await this._tree.loadChildren(id);
		return children.map(n => this._nodeItem(n));
	}
	private _nodeItem(n: import('../services/quantumide/common/quantumideFileExplorerTree.js').IQuantumIDEFileExplorerTreeNode): ITreeItem {
		return {
			handle: n.id,
			label: { label: n.label },
			description: n.path,
			resourceUri: n.resourceUri?.toJSON(),
			collapsibleState: n.isDirectory ? TreeItemCollapsibleState.Collapsed : TreeItemCollapsibleState.None,
			command: n.resourceUri && !n.isDirectory ? { id: 'vscode.open', title: n.label, arguments: [n.resourceUri] } : undefined,
		};
	}
}

class QuantumIDEParityCodeSearchProvider implements ITreeViewDataProvider {
	async getChildren(): Promise<readonly ITreeItem[]> {
		return [{
			handle: 'search:unified',
			collapsibleState: TreeItemCollapsibleState.None,
			label: { label: localize('parity.search.run', 'Run unified codebase search…') },
			command: { id: QuantumIDEAICommandId.ChatPanelUnifiedSearch, title: localize('parity.search.run', 'Search') },
		}, {
			handle: 'search:semantic',
			collapsibleState: TreeItemCollapsibleState.None,
			label: { label: localize('parity.search.unified', 'Unified search (semantic + symbols)') },
			command: { id: 'quantumide.search.unified', title: localize('parity.search.unified', 'Search') },
		}];
	}
}

export class QuantumIDEChatPanelParityViews extends Disposable {
	constructor(
		container: ViewContainer,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		const viewsRegistry = Registry.as<IViewsRegistry>(Extensions.ViewsRegistry);

		const registerTree = (id: string, name: string, order: number, treeView: TreeView, provider: ITreeViewDataProvider, collapsed: boolean) => {
			treeView.showCollapseAllAction = false;
			treeView.showRefreshAction = id === QuantumIDEChatPanelParityViewId.Tests || id === QuantumIDEChatPanelParityViewId.Dependencies;
			treeView.dataProvider = provider;
			viewsRegistry.registerViews([<ITreeViewDescriptor>{
				id,
				name: { value: name, original: name },
				ctorDescriptor: new SyncDescriptor(TreeViewPane),
				canToggleVisibility: true,
				canMoveView: true,
				treeView,
				collapsed,
				order,
			}], container);
		};

		const wRootsHolder = new MutableDisposable<ITreeView>();
		const wRootsTree = instantiationService.createInstance(TreeView, QuantumIDEChatPanelParityViewId.WorkspaceRoots, localize('parity.view.workspaceRoots', 'Workspace folders'));
		const wRootsProvider = instantiationService.createInstance(
			QuantumIDEParityWorkspaceRootsProvider,
			() => wRootsHolder.value?.refresh() ?? Promise.resolve(),
		);
		registerTree(
			QuantumIDEChatPanelParityViewId.WorkspaceRoots,
			localize('parity.view.workspaceRoots', 'Workspace folders'),
			1,
			wRootsTree,
			wRootsProvider,
			false,
		);
		wRootsHolder.value = wRootsTree;

		const navTree = instantiationService.createInstance(TreeView, QuantumIDEChatPanelParityViewId.NavigationHub, localize('parity.view.nav', 'Navigation & symbols'));
		registerTree(QuantumIDEChatPanelParityViewId.NavigationHub, localize('parity.view.nav', 'Navigation & symbols'), 2, navTree, new QuantumIDEParityNavigationHubProvider(), false);

		const threadsTree = instantiationService.createInstance(TreeView, QuantumIDEChatPanelParityViewId.ChatThreads, localize('parity.view.threads', 'Chat threads'));
		registerTree(
			QuantumIDEChatPanelParityViewId.ChatThreads,
			localize('parity.view.threads', 'Chat threads'),
			3,
			threadsTree,
			instantiationService.createInstance(QuantumIDEParityChatThreadsProvider),
			true,
		);

		const filesHolder = new MutableDisposable<ITreeView>();
		const filesTree = instantiationService.createInstance(TreeView, QuantumIDEChatPanelParityViewId.WorkspaceFiles, localize('parity.view.files', 'Workspace files'));
		const filesProvider = instantiationService.createInstance(
			QuantumIDEParityWorkspaceFilesProvider,
			() => filesHolder.value?.refresh() ?? Promise.resolve(),
		);
		registerTree(QuantumIDEChatPanelParityViewId.WorkspaceFiles, localize('parity.view.files', 'Workspace files'), 4, filesTree, filesProvider, true);
		filesHolder.value = filesTree;

		const searchTree = instantiationService.createInstance(TreeView, QuantumIDEChatPanelParityViewId.CodeSearch, localize('parity.view.search', 'Code search'));
		registerTree(QuantumIDEChatPanelParityViewId.CodeSearch, localize('parity.view.search', 'Code search'), 5, searchTree, new QuantumIDEParityCodeSearchProvider(), false);

		const testsHolder = new MutableDisposable<ITreeView>();
		const testsTree = instantiationService.createInstance(TreeView, QuantumIDEChatPanelParityViewId.Tests, localize('parity.view.tests', 'Detected tests'));
		const testsProvider = instantiationService.createInstance(
			QuantumIDEParityTestsProvider,
			() => testsHolder.value?.refresh() ?? Promise.resolve(),
		);
		registerTree(QuantumIDEChatPanelParityViewId.Tests, localize('parity.view.tests', 'Detected tests'), 6, testsTree, testsProvider, true);
		testsHolder.value = testsTree;

		const depsHolder = new MutableDisposable<ITreeView>();
		const depsTree = instantiationService.createInstance(TreeView, QuantumIDEChatPanelParityViewId.Dependencies, localize('parity.view.deps', 'Dependency graph (packages)'));
		const depsProvider = instantiationService.createInstance(
			QuantumIDEParityDependenciesProvider,
			() => depsHolder.value?.refresh() ?? Promise.resolve(),
		);
		registerTree(QuantumIDEChatPanelParityViewId.Dependencies, localize('parity.view.deps', 'Dependency graph (packages)'), 7, depsTree, depsProvider, true);
		depsHolder.value = depsTree;

		const mpTree = instantiationService.createInstance(TreeView, QuantumIDEChatPanelParityViewId.Marketplace, localize('parity.view.marketplace', 'Extensions & plugins'));
		registerTree(QuantumIDEChatPanelParityViewId.Marketplace, localize('parity.view.marketplace', 'Extensions & plugins'), 8, mpTree, new QuantumIDEParityMarketplaceProvider(), true);

		this._register(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: '_quantumide.parity.openUri',
					title: localize2('parity.internalOpenUri', 'Open URI'),
					f1: false,
				});
			}
			override async run(accessor: ServicesAccessor, uri: URI): Promise<void> {
				await accessor.get(IOpenerService).open(uri, { openExternal: true });
			}
		}));

		this._register(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: QuantumIDEAICommandId.ParityRemoveWorkspaceFolder,
					title: localize2('parity.removeFolder', 'Remove Folder from Workspace'),
					menu: {
						id: MenuId.ViewItemContext,
						when: ContextKeyExpr.and(
							ContextKeyExpr.equals('view', QuantumIDEChatPanelParityViewId.WorkspaceRoots),
							ContextKeyExpr.equals('viewItem', 'quantumideParityWorkspaceFolder'),
						),
						group: 'parity',
					},
				});
			}
			override async run(accessor: ServicesAccessor, arg: TreeViewItemHandleArg): Promise<void> {
				const decoded = decodeWorkspaceFolderHandle(arg.$treeItemHandle);
				if (!decoded) {
					return;
				}
				await accessor.get(IWorkspaceEditingService).removeFolders([decoded.uri]);
				await wRootsTree.refresh();
			}
		}));

		this._register(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: QuantumIDEAICommandId.ParityRenameWorkspaceFolder,
					title: localize2('parity.renameFolder', 'Rename Workspace Folder (label)…'),
					menu: {
						id: MenuId.ViewItemContext,
						when: ContextKeyExpr.and(
							ContextKeyExpr.equals('view', QuantumIDEChatPanelParityViewId.WorkspaceRoots),
							ContextKeyExpr.equals('viewItem', 'quantumideParityWorkspaceFolder'),
						),
						group: 'parity',
					},
				});
			}
			override async run(accessor: ServicesAccessor, arg: TreeViewItemHandleArg): Promise<void> {
				const decoded = decodeWorkspaceFolderHandle(arg.$treeItemHandle);
				if (!decoded) {
					return;
				}
				const workspace = accessor.get(IWorkspaceContextService);
				const editing = accessor.get(IWorkspaceEditingService);
				const quick = accessor.get(IQuickInputService);
				const folders = workspace.getWorkspace().folders;
				const idx = folders.findIndex(f => f.uri.toString() === decoded.uri.toString());
				if (idx < 0) {
					return;
				}
				const currentName = folders[idx].name;
				const name = await quick.input({ title: localize('parity.rename.input', 'Folder display name'), value: currentName });
				if (!name || name === currentName) {
					return;
				}
				await editing.updateFolders(idx, 0, [{ uri: decoded.uri, name }]);
				await wRootsTree.refresh();
			}
		}));
	}
}
