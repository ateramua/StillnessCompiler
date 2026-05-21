/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../base/common/buffer.js';
import { localize, localize2 } from '../../nls.js';
import { Action2, registerAction2 } from '../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../platform/instantiation/common/instantiation.js';
import { QuantumIDEAICommandId, type QuantumIDEChatSettingsCategory } from '../../platform/quantumide/common/quantumideAISettings.js';
import { openQuantumIDESettingsPanel } from './quantumideSettingsPanel.contribution.js';
import { IQuantumIDESemanticIndexService } from '../services/quantumide/common/quantumideSemanticIndex.js';
import { INotificationService } from '../../platform/notification/common/notification.js';
import { IDialogService } from '../../platform/dialogs/common/dialogs.js';
import { ICommandService } from '../../platform/commands/common/commands.js';
import { IFileService } from '../../platform/files/common/files.js';
import { IUserDataProfilesService } from '../../platform/userDataProfile/common/userDataProfile.js';
import { IClipboardService } from '../../platform/clipboard/common/clipboardService.js';
import { IFileDialogService } from '../../platform/dialogs/common/dialogs.js';
import {
	parseQuantumIDEKeybindingImportJson,
	serializeQuantumIDEKeybindingExport,
	type IQuantumIDEKeybindingExportEntry,
} from '../../platform/quantumide/common/quantumideKeybindingIO.js';
import { IKeybindingService } from '../../platform/keybinding/common/keybinding.js';
function registerOpenPanelCategoryAction(commandId: string, title: string, category: QuantumIDEChatSettingsCategory): void {
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: commandId,
				title: { value: title, original: title },
				category: { value: localize('quantumide.settings.category', 'QuantumIDE Settings'), original: 'QuantumIDE Settings' },
				f1: true,
			});
		}
		override async run(accessor: ServicesAccessor): Promise<void> {
			await openQuantumIDESettingsPanel(accessor, category);
		}
	});
}

registerOpenPanelCategoryAction(QuantumIDEAICommandId.OpenSettingsPanelCategory + '.general', 'QuantumIDE: Open General Settings Panel', 'general');
registerOpenPanelCategoryAction(QuantumIDEAICommandId.OpenSettingsPanelCategory + '.models', 'QuantumIDE: Open AI Models Settings Panel', 'models');
registerOpenPanelCategoryAction(QuantumIDEAICommandId.OpenSettingsPanelCategory + '.chat', 'QuantumIDE: Open Chat Settings Panel', 'chat');
registerOpenPanelCategoryAction(QuantumIDEAICommandId.OpenSettingsPanelCategory + '.agent', 'QuantumIDE: Open Agent Settings Panel', 'agent');
registerOpenPanelCategoryAction(QuantumIDEAICommandId.OpenSettingsPanelCategory + '.editor', 'QuantumIDE: Open Editor Settings Panel', 'editor');
registerOpenPanelCategoryAction(QuantumIDEAICommandId.OpenSettingsPanelCategory + '.terminal', 'QuantumIDE: Open Terminal Settings Panel', 'terminal');
registerOpenPanelCategoryAction(QuantumIDEAICommandId.OpenSettingsPanelCategory + '.indexing', 'QuantumIDE: Open Indexing Settings Panel', 'indexing');
registerOpenPanelCategoryAction(QuantumIDEAICommandId.OpenSettingsPanelCategory + '.privacy', 'QuantumIDE: Open Privacy Settings Panel', 'privacy');
registerOpenPanelCategoryAction(QuantumIDEAICommandId.OpenSettingsPanelCategory + '.workspace', 'QuantumIDE: Open Workspace Settings Panel', 'workspace');
registerOpenPanelCategoryAction(QuantumIDEAICommandId.OpenSettingsPanelCategory + '.security', 'QuantumIDE: Open Security Settings Panel', 'security');
registerOpenPanelCategoryAction(QuantumIDEAICommandId.OpenSettingsPanelCategory + '.appearance', 'QuantumIDE: Open Appearance Settings Panel', 'appearance');
registerOpenPanelCategoryAction(QuantumIDEAICommandId.OpenSettingsPanelCategory + '.keybindings', 'QuantumIDE: Open Keybindings Settings Panel', 'keybindings');
registerOpenPanelCategoryAction(QuantumIDEAICommandId.OpenSettingsPanelCategory + '.accounts', 'QuantumIDE: Open Accounts Settings Panel', 'accounts');
registerOpenPanelCategoryAction(QuantumIDEAICommandId.OpenSettingsPanelCategory + '.extensions', 'QuantumIDE: Open Extensions Settings Panel', 'extensions');
registerOpenPanelCategoryAction(QuantumIDEAICommandId.OpenSettingsPanelCategory + '.experimental', 'QuantumIDE: Open Experimental Settings Panel', 'experimental');

function collectUserKeybindingEntries(keybindingService: IKeybindingService): IQuantumIDEKeybindingExportEntry[] {
	const entries: IQuantumIDEKeybindingExportEntry[] = [];
	for (const item of keybindingService.getKeybindings()) {
		if (item.isDefault || !item.command || item.chords.length === 0) {
			continue;
		}
		entries.push({
			key: item.chords.join(' '),
			command: item.command,
			when: item.when ? String(item.when) : undefined,
		});
	}
	return entries;
}

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: QuantumIDEAICommandId.ClearIndexCache,
			title: localize2('quantumide.clearIndexCache', 'QuantumIDE: Clear Index Cache'),
			category: { value: localize('quantumide.ai.category', 'QuantumIDE AI'), original: 'QuantumIDE AI' },
			f1: true,
		});
	}
	override async run(accessor: ServicesAccessor): Promise<void> {
		const dialogService = accessor.get(IDialogService);
		const confirmed = await dialogService.confirm({
			message: localize('quantumide.clearIndexCache.confirm', 'Clear QuantumIDE index cache?'),
			detail: localize('quantumide.clearIndexCache.detail', 'Removes `.quantumide` index files from the workspace. The next search or reindex will rebuild them.'),
			primaryButton: localize('quantumide.clearIndexCache.primary', 'Clear cache'),
		});
		if (!confirmed.confirmed) {
			return;
		}
		await accessor.get(IQuantumIDESemanticIndexService).clearIndexCache();
		accessor.get(INotificationService).info(localize('quantumide.clearIndexCache.done', 'QuantumIDE index cache cleared.'));
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'quantumide.settings.importKeybindings',
			title: localize2('quantumide.settings.importKeybindings', 'QuantumIDE: Import Keybindings'),
			category: { value: localize('quantumide.settings.category', 'QuantumIDE Settings'), original: 'QuantumIDE Settings' },
			f1: true,
		});
	}
	override async run(accessor: ServicesAccessor): Promise<void> {
		const fileDialogService = accessor.get(IFileDialogService);
		const fileService = accessor.get(IFileService);
		const profileService = accessor.get(IUserDataProfilesService);
		const notificationService = accessor.get(INotificationService);
		const picks = await fileDialogService.showOpenDialog({
			canSelectFiles: true,
			canSelectMany: false,
			filters: [{ name: 'JSON', extensions: ['json'] }],
			title: localize('quantumide.settings.importKeybindings.pick', 'Select keybindings JSON to import'),
		});
		const source = picks?.[0];
		if (!source) {
			return;
		}
		const imported = parseQuantumIDEKeybindingImportJson((await fileService.readFile(source)).value.toString());
		const target = profileService.defaultProfile.keybindingsResource;
		let existing: unknown[] = [];
		try {
			existing = JSON.parse((await fileService.readFile(target)).value.toString());
			if (!Array.isArray(existing)) {
				existing = [];
			}
		} catch {
			existing = [];
		}
		const merged: unknown[] = [...existing, ...imported];
		await fileService.writeFile(target, VSBuffer.fromString(JSON.stringify(merged, undefined, 2)));
		notificationService.info(localize('quantumide.settings.importKeybindings.done', 'Imported {0} keybinding(s). Reload may be required.', imported.length));
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'quantumide.settings.exportKeybindings',
			title: localize2('quantumide.settings.exportKeybindings', 'QuantumIDE: Export Keybindings'),
			category: { value: localize('quantumide.settings.category', 'QuantumIDE Settings'), original: 'QuantumIDE Settings' },
			f1: true,
		});
	}
	override async run(accessor: ServicesAccessor): Promise<void> {
		const fileDialogService = accessor.get(IFileDialogService);
		const fileService = accessor.get(IFileService);
		const clipboardService = accessor.get(IClipboardService);
		const notificationService = accessor.get(INotificationService);
		const entries = collectUserKeybindingEntries(accessor.get(IKeybindingService));
		const payload = serializeQuantumIDEKeybindingExport(entries);
		const picks = await fileDialogService.showSaveDialog({
			title: localize('quantumide.settings.exportKeybindings.save', 'Export keybindings'),
			filters: [{ name: 'JSON', extensions: ['json'] }],
			defaultUri: undefined,
		});
		if (picks) {
			await fileService.writeFile(picks, VSBuffer.fromString(payload));
			notificationService.info(localize('quantumide.settings.exportKeybindings.saved', 'Exported {0} keybinding(s).', entries.length));
			return;
		}
		await clipboardService.writeText(payload);
		notificationService.info(localize('quantumide.settings.exportKeybindings.clipboard', 'Copied {0} keybinding(s) to the clipboard.', entries.length));
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'quantumide.settings.openWorkspaceKeybindings',
			title: localize2('quantumide.settings.openWorkspaceKeybindings', 'QuantumIDE: Open Workspace Keybindings'),
			category: { value: localize('quantumide.settings.category', 'QuantumIDE Settings'), original: 'QuantumIDE Settings' },
			f1: true,
		});
	}
	override async run(accessor: ServicesAccessor): Promise<void> {
		await accessor.get(ICommandService).executeCommand('workbench.action.openWorkspaceKeybindingsFile');
	}
});
