/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../nls.js';
import { Action2, registerAction2 } from '../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../platform/instantiation/common/instantiation.js';
import { QuantumIDEAICommandId, type QuantumIDEChatSettingsCategory } from '../../platform/quantumide/common/quantumideAISettings.js';
import { IQuantumIDESemanticIndexService } from '../services/quantumide/common/quantumideSemanticIndex.js';
import { INotificationService } from '../../platform/notification/common/notification.js';
import { IPreferencesService } from '../../workbench/services/preferences/common/preferences.js';
import { openQuantumIDESettingsPanel } from './quantumideSettingsPanel.contribution.js';
import { AGENT_WORKFLOW_SETTINGS_QUERY } from './quantumideSettingsQueries.js';

function registerSettingsPanelAction(commandId: string, title: string, category: QuantumIDEChatSettingsCategory): void {
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

registerSettingsPanelAction(QuantumIDEAICommandId.OpenSettingsChat, 'QuantumIDE: Open Chat Settings', 'chat');
registerSettingsPanelAction(QuantumIDEAICommandId.OpenSettingsAgent, 'QuantumIDE: Open Agent Settings', 'agent');

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: QuantumIDEAICommandId.OpenSettingsAgentWorkflow,
			title: localize2('quantumide.settings.openAgentWorkflow', 'QuantumIDE: Open Edit Velocity & Verify On Edit'),
			category: { value: localize('quantumide.settings.category', 'QuantumIDE Settings'), original: 'QuantumIDE Settings' },
			f1: true,
		});
	}
	override async run(accessor: ServicesAccessor): Promise<void> {
		await accessor.get(IPreferencesService).openSettings({ jsonEditor: false, query: AGENT_WORKFLOW_SETTINGS_QUERY });
	}
});
registerSettingsPanelAction(QuantumIDEAICommandId.OpenSettingsEditor, 'QuantumIDE: Open Editor AI Settings', 'editor');
registerSettingsPanelAction(QuantumIDEAICommandId.OpenSettingsTerminal, 'QuantumIDE: Open Terminal Settings', 'terminal');
registerSettingsPanelAction(QuantumIDEAICommandId.OpenSettingsIndexing, 'QuantumIDE: Open Indexing Settings', 'indexing');
registerSettingsPanelAction(QuantumIDEAICommandId.OpenSettingsPrivacy, 'QuantumIDE: Open Privacy Settings', 'privacy');
registerSettingsPanelAction(QuantumIDEAICommandId.OpenSettingsAppearance, 'QuantumIDE: Open Appearance Settings', 'appearance');
registerSettingsPanelAction(QuantumIDEAICommandId.OpenSettingsKeybindings, 'QuantumIDE: Open Keybindings', 'keybindings');
registerSettingsPanelAction(QuantumIDEAICommandId.OpenSettingsAccounts, 'QuantumIDE: Open Accounts Settings', 'accounts');
registerSettingsPanelAction(QuantumIDEAICommandId.OpenSettingsExtensions, 'QuantumIDE: Open Extensions Settings', 'extensions');
registerSettingsPanelAction(QuantumIDEAICommandId.OpenSettingsExperimental, 'QuantumIDE: Open Experimental Settings', 'experimental');

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: QuantumIDEAICommandId.InspectIndexCache,
			title: localize2('quantumide.inspectIndexCache', 'QuantumIDE: Inspect Index Cache'),
			category: { value: localize('quantumide.ai.category', 'QuantumIDE AI'), original: 'QuantumIDE AI' },
			f1: true,
		});
	}
	override async run(accessor: ServicesAccessor): Promise<void> {
		const summary = await accessor.get(IQuantumIDESemanticIndexService).inspectCache();
		accessor.get(INotificationService).info(summary);
	}
});
