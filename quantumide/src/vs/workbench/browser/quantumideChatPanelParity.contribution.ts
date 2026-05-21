/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../base/common/buffer.js';
import { Codicon } from '../../base/common/codicons.js';
import { Disposable } from '../../base/common/lifecycle.js';
import { joinPath } from '../../base/common/resources.js';
import { URI } from '../../base/common/uri.js';
import { localize, localize2 } from '../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../platform/actions/common/actions.js';
import { IFileService } from '../../platform/files/common/files.js';
import { ICommandService } from '../../platform/commands/common/commands.js';
import { IOpenerService } from '../../platform/opener/common/opener.js';
import { Registry } from '../../platform/registry/common/platform.js';
import { isQuantumIDEProduct } from '../../platform/quantumide/common/quantumideChatPlatform.js';
import { QuantumIDEAICommandId } from '../../platform/quantumide/common/quantumideAISettings.js';
import { quantumideFuzzyMatchFilePaths } from '../../platform/quantumide/common/quantumideFuzzyFileMatch.js';
import { IQuickInputService } from '../../platform/quickinput/common/quickInput.js';
import { IWorkspaceContextService } from '../../platform/workspace/common/workspace.js';
import { SyncDescriptor } from '../../platform/instantiation/common/descriptors.js';
import { IInstantiationService, ServicesAccessor } from '../../platform/instantiation/common/instantiation.js';
import product from '../../platform/product/common/product.js';
import { IViewContainersRegistry, Extensions as ViewExtensions, ViewContainerLocation } from '../common/views.js';
import { ViewPaneContainer } from './parts/views/viewPaneContainer.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../common/contributions.js';
import { QuantumIDEChatPanelParityViews, QUANTUMIDE_CHAT_PANEL_PARITY_CONTAINER_ID, QuantumIDEChatPanelParityViewId } from './quantumideChatPanelParityViews.js';
import { IQuantumIDEWorkspaceContextService } from '../services/quantumide/common/quantumideWorkspaceContext.js';
import { IQuantumIDEFileNavigationService } from '../services/quantumide/browser/quantumideFileNavigationService.js';
import { IQuantumIDEProjectManagerService } from '../services/quantumide/common/quantumideProjectManager.js';
import { IQuantumIDEChatPluginMarketplaceService } from '../services/quantumide/common/quantumideChatPluginMarketplace.js';
import { IQuantumIDEChatRichUiService } from '../services/quantumide/common/quantumideChatRichUi.js';
import { IQuantumIDEOnboardingService } from '../services/quantumide/browser/quantumideOnboardingService.js';
import { INotificationService } from '../../platform/notification/common/notification.js';
import { ContextKeyExpr } from '../../platform/contextkey/common/contextkey.js';

function isQuantumIDE(): boolean {
	return isQuantumIDEProduct(product.applicationName)
		|| [product.nameShort, product.nameLong].some(n => typeof n === 'string' && n.toLowerCase().includes('quantumide'));
}

class QuantumIDEChatPanelParityWorkbenchContribution extends Disposable {
	static readonly ID = 'workbench.contrib.quantumideChatPanelParity';

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		const container = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).registerViewContainer(
			{
				id: QUANTUMIDE_CHAT_PANEL_PARITY_CONTAINER_ID,
				title: localize2('quantumide.chatPanel.parity.container', 'QuantumIDE Chat Parity'),
				ctorDescriptor: new SyncDescriptor(
					ViewPaneContainer,
					[QUANTUMIDE_CHAT_PANEL_PARITY_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: false }],
				),
				icon: Codicon.listFlat,
				hideIfEmpty: false,
				order: 12,
			},
			ViewContainerLocation.Sidebar,
			{ doNotRegisterOpenCommand: false },
		);
		this._register(instantiationService.createInstance(QuantumIDEChatPanelParityViews, container));
	}
}

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: QuantumIDEAICommandId.ParityFuzzyWorkspaceFiles,
			title: localize2('quantumide.parity.fuzzyFiles', 'QuantumIDE: Fuzzy Find Workspace Files'),
			category: { value: localize('quantumide.parity.category', 'QuantumIDE Chat Parity'), original: 'QuantumIDE Chat Parity' },
			f1: true,
		});
	}
	override async run(accessor: ServicesAccessor): Promise<void> {
		const ctx = accessor.get(IQuantumIDEWorkspaceContextService);
		const nav = accessor.get(IQuantumIDEFileNavigationService);
		const quick = accessor.get(IQuickInputService);
		const graph = ctx.getWorkspaceGraph();
		if (!graph?.files.length) {
			await ctx.refreshWorkspaceGraph('fuzzy file finder');
		}
		const paths = ctx.getWorkspaceGraph()?.files.map(f => f.workspaceRelativePath) ?? [];
		if (!paths.length) {
			accessor.get(INotificationService).warn(localize('quantumide.parity.fuzzy.noFiles', 'No workspace files indexed yet.'));
			return;
		}
		const pick = quick.createQuickPick();
		pick.placeholder = localize('quantumide.parity.fuzzy.placeholder', 'Type to filter paths (fuzzy subsequence match)');
		pick.matchOnDescription = false;
		pick.matchOnLabel = false;
		pick.ignoreFocusOut = false;
		const update = (value: string) => {
			const matches = quantumideFuzzyMatchFilePaths(value, paths, 100);
			pick.items = matches.map(m => ({
				label: m.path,
				highlights: { label: m.highlights.map(([start, end]) => ({ start, end })) },
			}));
		};
		update('');
		pick.onDidChangeValue(update);
		const chosen = await new Promise<string | undefined>(resolve => {
			pick.onDidAccept(() => {
				resolve(pick.selectedItems[0]?.label);
				pick.hide();
			});
			pick.onDidHide(() => resolve(undefined));
			pick.show();
		});
		pick.dispose();
		if (chosen) {
			await nav.openFile(chosen);
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: QuantumIDEAICommandId.ParityShowNotificationCenter,
			title: localize2('quantumide.parity.notifications', 'QuantumIDE: Open Notification Center'),
			category: { value: localize('quantumide.parity.category', 'QuantumIDE Chat Parity'), original: 'QuantumIDE Chat Parity' },
			f1: true,
		});
	}
	override run(accessor: ServicesAccessor): Promise<unknown> {
		return accessor.get(ICommandService).executeCommand('notifications.showList');
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: QuantumIDEAICommandId.ParityOpenPackageJson,
			title: localize2('quantumide.parity.openPackageJson', 'QuantumIDE: Open package.json'),
			category: { value: localize('quantumide.parity.category', 'QuantumIDE Chat Parity'), original: 'QuantumIDE Chat Parity' },
			f1: true,
		});
	}
	override async run(accessor: ServicesAccessor): Promise<void> {
		const uri = await findManifestUri(accessor, 'package.json');
		if (!uri) {
			accessor.get(INotificationService).warn(localize('quantumide.parity.noPkg', 'No package.json found in the workspace graph.'));
			return;
		}
		await accessor.get(IOpenerService).open(uri);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: QuantumIDEAICommandId.ParityOpenPyProject,
			title: localize2('quantumide.parity.openPyProject', 'QuantumIDE: Open pyproject.toml'),
			category: { value: localize('quantumide.parity.category', 'QuantumIDE Chat Parity'), original: 'QuantumIDE Chat Parity' },
			f1: true,
		});
	}
	override async run(accessor: ServicesAccessor): Promise<void> {
		const uri = await findManifestUri(accessor, 'pyproject.toml');
		if (!uri) {
			accessor.get(INotificationService).warn(localize('quantumide.parity.noPy', 'No pyproject.toml found in the workspace graph.'));
			return;
		}
		await accessor.get(IOpenerService).open(uri);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: QuantumIDEAICommandId.ParityAddPackageScript,
			title: localize2('quantumide.parity.addScript', 'QuantumIDE: Add npm script to package.json'),
			category: { value: localize('quantumide.parity.category', 'QuantumIDE Chat Parity'), original: 'QuantumIDE Chat Parity' },
			f1: true,
		});
	}
	override async run(accessor: ServicesAccessor): Promise<void> {
		const uri = await findManifestUri(accessor, 'package.json');
		const notifications = accessor.get(INotificationService);
		const files = accessor.get(IFileService);
		const quick = accessor.get(IQuickInputService);
		if (!uri) {
			notifications.warn(localize('quantumide.parity.noPkg', 'No package.json found in the workspace graph.'));
			return;
		}
		const name = await quick.input({ title: localize('quantumide.parity.scriptName', 'Script name'), placeHolder: 'build:types' });
		if (!name) {
			return;
		}
		const command = await quick.input({ title: localize('quantumide.parity.scriptCmd', 'Command'), placeHolder: 'tsc --noEmit' });
		if (!command) {
			return;
		}
		try {
			const raw = (await files.readFile(uri)).value.toString();
			const json = JSON.parse(raw) as { scripts?: Record<string, string> };
			json.scripts = { ...(json.scripts ?? {}), [name]: command };
			const next = JSON.stringify(json, null, 2) + '\n';
			await files.writeFile(uri, VSBuffer.fromString(next));
			notifications.info(localize('quantumide.parity.scriptAdded', 'Added script "{0}".', name));
		} catch (e) {
			notifications.error(localize('quantumide.parity.scriptErr', 'Could not update package.json: {0}', String(e)));
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: QuantumIDEAICommandId.ParityAddPackageDependency,
			title: localize2('quantumide.parity.addDep', 'QuantumIDE: Add npm dependency in package.json'),
			category: { value: localize('quantumide.parity.category', 'QuantumIDE Chat Parity'), original: 'QuantumIDE Chat Parity' },
			f1: true,
		});
	}
	override async run(accessor: ServicesAccessor): Promise<void> {
		const uri = await findManifestUri(accessor, 'package.json');
		const notifications = accessor.get(INotificationService);
		const files = accessor.get(IFileService);
		const quick = accessor.get(IQuickInputService);
		if (!uri) {
			notifications.warn(localize('quantumide.parity.noPkg', 'No package.json found in the workspace graph.'));
			return;
		}
		const dep = await quick.input({ title: localize('quantumide.parity.depName', 'Dependency name'), placeHolder: 'lodash' });
		if (!dep) {
			return;
		}
		const version = await quick.input({ title: localize('quantumide.parity.depVer', 'Version range (optional)'), placeHolder: '^4.17.21', value: '*' });
		if (version === undefined) {
			return;
		}
		const devPick = await quick.pick(
			[
				{ label: localize('quantumide.parity.depRuntime', 'dependency'), isDev: false },
				{ label: localize('quantumide.parity.depDev', 'devDependency'), isDev: true },
			],
			{ placeHolder: localize('quantumide.parity.depKind', 'Dependency kind') },
		);
		if (!devPick || !('isDev' in devPick)) {
			return;
		}
		try {
			const raw = (await files.readFile(uri)).value.toString();
			const json = JSON.parse(raw) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
			const key = (devPick as { isDev: boolean }).isDev ? 'devDependencies' : 'dependencies';
			const bucket = { ...(json[key] ?? {}) };
			bucket[dep] = version || '*';
			(json as Record<string, unknown>)[key] = bucket;
			const next = JSON.stringify(json, null, 2) + '\n';
			await files.writeFile(uri, VSBuffer.fromString(next));
			notifications.info(localize('quantumide.parity.depAdded', 'Added {0} to {1}.', dep, key));
		} catch (e) {
			notifications.error(localize('quantumide.parity.depErr', 'Could not update package.json: {0}', String(e)));
		}
	}
});

async function findManifestUri(accessor: ServicesAccessor, fileName: string): Promise<URI | undefined> {
	const ctx = accessor.get(IQuantumIDEWorkspaceContextService);
	const workspace = accessor.get(IWorkspaceContextService);
	let graph = ctx.getWorkspaceGraph();
	if (!graph?.files.length) {
		await ctx.refreshWorkspaceGraph('manifest lookup');
		graph = ctx.getWorkspaceGraph();
	}
	const hit = graph?.files.find(f => f.workspaceRelativePath.endsWith(fileName));
	if (!hit?.uri) {
		const folder = workspace.getWorkspace().folders[0];
		return folder ? joinPath(folder.uri, fileName) : undefined;
	}
	return URI.parse(hit.uri);
}

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'quantumide.chat.addWorkspaceFolder',
			title: localize2('quantumide.chat.addFolder', 'QuantumIDE: Add Workspace Folder'),
			category: { value: localize('quantumide.parity.category', 'QuantumIDE Chat Parity'), original: 'QuantumIDE Chat Parity' },
			f1: true,
		});
	}
	override async run(accessor: ServicesAccessor): Promise<void> {
		const r = await accessor.get(IQuantumIDEProjectManagerService).addFolderFromPicker();
		if (r.error) {
			accessor.get(INotificationService).error(r.error);
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'quantumide.chat.openWorkspaceFolder',
			title: localize2('quantumide.chat.openFolder', 'QuantumIDE: Open Folder'),
			category: { value: localize('quantumide.parity.category', 'QuantumIDE Chat Parity'), original: 'QuantumIDE Chat Parity' },
			f1: true,
		});
	}
	override async run(accessor: ServicesAccessor): Promise<void> {
		const r = await accessor.get(IQuantumIDEProjectManagerService).openFolder();
		if (r.error) {
			accessor.get(INotificationService).error(r.error);
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'quantumide.chat.removeWorkspaceFolder',
			title: localize2('quantumide.chat.removeFolder', 'QuantumIDE: Remove Workspace Folder'),
			category: { value: localize('quantumide.parity.category', 'QuantumIDE Chat Parity'), original: 'QuantumIDE Chat Parity' },
			f1: true,
		});
	}
	override async run(accessor: ServicesAccessor, uri?: URI): Promise<void> {
		if (!uri) {
			return;
		}
		const r = await accessor.get(IQuantumIDEProjectManagerService).removeFolder(uri);
		if (r.error) {
			accessor.get(INotificationService).error(r.error);
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'quantumide.chat.togglePlugin',
			title: localize2('quantumide.chat.togglePlugin', 'QuantumIDE: Toggle Plugin'),
			category: { value: localize('quantumide.parity.category', 'QuantumIDE Chat Parity'), original: 'QuantumIDE Chat Parity' },
		});
	}
	override async run(accessor: ServicesAccessor, pluginId?: string, enabled?: boolean): Promise<void> {
		if (!pluginId || typeof enabled !== 'boolean') {
			return;
		}
		accessor.get(IQuantumIDEChatPluginMarketplaceService).setEnabled(pluginId, enabled);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'quantumide.chat.addContextCard',
			title: localize2('quantumide.chat.addContextCard', 'QuantumIDE: Add Context Card'),
			category: { value: localize('quantumide.parity.category', 'QuantumIDE Chat Parity'), original: 'QuantumIDE Chat Parity' },
			f1: true,
		});
	}
	override async run(accessor: ServicesAccessor): Promise<void> {
		const workspace = accessor.get(IWorkspaceContextService);
		const folder = workspace.getWorkspace().folders[0];
		accessor.get(IQuantumIDEChatRichUiService).addCard({
			threadId: 'workspace',
			kind: 'context',
			title: localize('quantumide.chat.card.workspace', 'Workspace'),
			body: folder ? folder.uri.fsPath : localize('quantumide.chat.card.noWorkspace', 'No folder open'),
			pinned: false,
		});
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'quantumide.chat.pinContextCard',
			title: localize2('quantumide.chat.pinContextCard', 'QuantumIDE: Pin Context Card'),
		});
	}
	override run(accessor: ServicesAccessor, id?: string, pinned?: boolean): void {
		if (!id || typeof pinned !== 'boolean') {
			return;
		}
		accessor.get(IQuantumIDEChatRichUiService).pinCard(id, pinned);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'quantumide.chat.removeContextCard',
			title: localize2('quantumide.chat.removeContextCard', 'QuantumIDE: Remove Context Card'),
		});
	}
	override run(accessor: ServicesAccessor, id?: string): void {
		if (!id) {
			return;
		}
		accessor.get(IQuantumIDEChatRichUiService).removeCard(id);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'quantumide.chat.onboardingNext',
			title: localize2('quantumide.chat.onboardingNext', 'QuantumIDE: Next Onboarding Step'),
		});
	}
	override run(accessor: ServicesAccessor): void {
		const o = accessor.get(IQuantumIDEOnboardingService);
		o.setTourStep(o.getTourStep() + 1);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'quantumide.chat.onboardingSkip',
			title: localize2('quantumide.chat.onboardingSkip', 'QuantumIDE: Skip Onboarding Tour'),
		});
	}
	override run(accessor: ServicesAccessor): void {
		const o = accessor.get(IQuantumIDEOnboardingService);
		o.skipTour();
		o.markOnboardingComplete();
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'quantumide.parity.addWorkspaceFolder',
			title: localize2('quantumide.parity.addFolder', 'QuantumIDE Parity: Add Folder to Workspace'),
			icon: Codicon.rootFolder,
			menu: {
				id: MenuId.ViewTitle,
				when: ContextKeyExpr.equals('view', QuantumIDEChatPanelParityViewId.WorkspaceRoots),
				group: 'navigation',
			},
		});
	}
	override run(accessor: ServicesAccessor): Promise<unknown> {
		return accessor.get(ICommandService).executeCommand('workbench.action.addRootFolder');
	}
});

if (isQuantumIDE()) {
	registerWorkbenchContribution2(QuantumIDEChatPanelParityWorkbenchContribution.ID, QuantumIDEChatPanelParityWorkbenchContribution, WorkbenchPhase.AfterRestored);
}
