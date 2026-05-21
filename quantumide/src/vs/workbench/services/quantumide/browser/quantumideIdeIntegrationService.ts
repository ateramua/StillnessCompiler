/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService, ConfigurationTarget } from '../../../../platform/configuration/common/configuration.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ExtensionRuntimeActionType, IExtensionsWorkbenchService, type IExtension } from '../../../contrib/extensions/common/extensions.js';
import { EnablementState } from '../../../services/extensionManagement/common/extensionManagement.js';
import { IQuantumIDEIdeIntegrationResult, IQuantumIDEIdeIntegrationService } from '../common/quantumideIdeIntegration.js';
import { evaluateQuantumIDECommandPolicy } from '../../../../platform/quantumide/common/quantumideCommandPolicy.js';
import { isAgentWritableSettingKey, isValidMarketplaceExtensionId } from '../../../../platform/quantumide/common/quantumideIdeSettingPolicy.js';
import { QuantumIDEAISettingId } from '../../../../platform/quantumide/common/quantumideAISettings.js';

const LSP_COMMANDS: Record<string, string> = {
	rename: 'editor.action.rename',
	format: 'editor.action.formatDocument',
	organizeImports: 'editor.action.organizeImports',
	quickFix: 'editor.action.quickFix',
	refactor: 'editor.action.refactor',
};

export class QuantumIDEIdeIntegrationService implements IQuantumIDEIdeIntegrationService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@ICommandService private readonly _commands: ICommandService,
		@IConfigurationService private readonly _config: IConfigurationService,
		@IExtensionsWorkbenchService private readonly _extensions: IExtensionsWorkbenchService,
	) { }

	async executeCommand(commandId: string, args?: unknown): Promise<IQuantumIDEIdeIntegrationResult> {
		const policy = evaluateQuantumIDECommandPolicy(commandId, {
			dangerousBlockEnabled: this._config.getValue<boolean>(QuantumIDEAISettingId.AgentDangerousCommandBlock) !== false,
		});
		if (!policy.allowed) {
			return { success: false, message: policy.reason ?? 'Command blocked.' };
		}
		try {
			await this._commands.executeCommand(commandId, args);
			return { success: true, message: localize('quantumide.ide.cmdOk', 'Executed {0}', commandId) };
		} catch (err) {
			return { success: false, message: err instanceof Error ? err.message : String(err) };
		}
	}

	async updateSetting(key: string, value: unknown, scope: 'user' | 'workspace' = 'user'): Promise<IQuantumIDEIdeIntegrationResult> {
		if (!isAgentWritableSettingKey(key)) {
			return { success: false, message: localize('quantumide.ide.settingBlocked', 'Setting key not allowed for agent update.') };
		}
		try {
			await this._config.updateValue(key, value, scope === 'workspace' ? ConfigurationTarget.WORKSPACE : ConfigurationTarget.USER);
			return { success: true, message: localize('quantumide.ide.settingOk', 'Updated {0}', key) };
		} catch (err) {
			return { success: false, message: err instanceof Error ? err.message : String(err) };
		}
	}

	async listExtensions(query?: string): Promise<readonly { id: string; enabled: boolean }[]> {
		const q = query?.trim().toLowerCase();
		const local = this._extensions.local;
		return local
			.filter((e: IExtension) => !q || e.identifier.id.toLowerCase().includes(q))
			.slice(0, 50)
			.map((e: IExtension) => ({
				id: e.identifier.id,
				enabled: e.enablementState === EnablementState.EnabledGlobally || e.enablementState === EnablementState.EnabledWorkspace,
			}));
	}

	async setExtensionEnabled(extensionId: string, enabled: boolean): Promise<IQuantumIDEIdeIntegrationResult> {
		try {
			const ext = this._extensions.local.find((e: IExtension) => e.identifier.id === extensionId);
			if (!ext) {
				return { success: false, message: localize('quantumide.ide.extMissing', 'Extension not found: {0}', extensionId) };
			}
			await this._extensions.setEnablement(ext, enabled ? EnablementState.EnabledGlobally : EnablementState.DisabledGlobally);
			return { success: true, message: localize('quantumide.ide.extOk', 'Extension {0} {1}', extensionId, enabled ? 'enabled' : 'disabled') };
		} catch (err) {
			return { success: false, message: err instanceof Error ? err.message : String(err) };
		}
	}

	async installExtension(extensionId: string, enable = true): Promise<IQuantumIDEIdeIntegrationResult> {
		const id = extensionId.trim();
		if (!isValidMarketplaceExtensionId(id)) {
			return { success: false, message: localize('quantumide.ide.extInvalid', 'Invalid extension id.') };
		}
		try {
			const installed = await this._extensions.install(id, { enable });
			const needsReload = installed?.runtimeState?.action === ExtensionRuntimeActionType.ReloadWindow
				|| installed?.runtimeState?.action === ExtensionRuntimeActionType.RestartExtensions;
			return {
				success: true,
				message: localize(
					'quantumide.ide.extInstalled',
					'Installed {0}{1}',
					id,
					needsReload ? localize('quantumide.ide.extReload', ' — reload window to activate.') : '',
				),
			};
		} catch (err) {
			return { success: false, message: err instanceof Error ? err.message : String(err) };
		}
	}

	async runLspAction(action: 'rename' | 'format' | 'organizeImports' | 'quickFix' | 'refactor'): Promise<IQuantumIDEIdeIntegrationResult> {
		const cmd = LSP_COMMANDS[action];
		return cmd ? this.executeCommand(cmd) : { success: false, message: 'Unknown LSP action.' };
	}
}

registerSingleton(IQuantumIDEIdeIntegrationService, QuantumIDEIdeIntegrationService, InstantiationType.Delayed);
