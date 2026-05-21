/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { QuantumIDEAICommandId } from '../../../../platform/quantumide/common/quantumideAISettings.js';
import { getQuantumIDEPlugins } from '../../../../platform/quantumide/common/quantumidePluginRegistry.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IExtensionManagementService } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import {
	IQuantumIDEChatPluginListing,
	IQuantumIDEChatPluginMarketplaceService,
} from '../common/quantumideChatPluginMarketplace.js';
import { IQuantumIDEPluginSettingsService } from './quantumidePluginSettingsService.js';

export class QuantumIDEChatPluginMarketplaceService extends Disposable implements IQuantumIDEChatPluginMarketplaceService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private _listings: IQuantumIDEChatPluginListing[] = [];

	constructor(
		@IQuantumIDEPluginSettingsService private readonly _pluginSettings: IQuantumIDEPluginSettingsService,
		@IExtensionManagementService private readonly _extensions: IExtensionManagementService,
	) {
		super();
		this._register(this._pluginSettings.onDidChange(() => this.refresh()));
		this.refresh();
	}

	search(query: string): readonly IQuantumIDEChatPluginListing[] {
		const q = query.trim().toLowerCase();
		if (!q) {
			return this._listings;
		}
		return this._listings.filter(l =>
			l.id.toLowerCase().includes(q)
			|| l.name.toLowerCase().includes(q)
			|| l.description.toLowerCase().includes(q),
		);
	}

	getInstalled(): readonly IQuantumIDEChatPluginListing[] {
		return this._listings;
	}

	setEnabled(pluginId: string, enabled: boolean): void {
		this._pluginSettings.setPluginEnabled(pluginId, enabled);
	}

	refresh(): void {
		const enablement = this._pluginSettings.getEnablement();
		const quantum: IQuantumIDEChatPluginListing[] = getQuantumIDEPlugins(enablement).map(p => ({
			id: p.id,
			name: p.id,
			description: p.customPromptPrefix?.slice(0, 120) ?? localize('quantumide.plugin.noDesc', 'QuantumIDE plugin'),
			enabled: enablement.enabledPluginIds.length === 0 || enablement.enabledPluginIds.includes(p.id),
			source: 'quantumide' as const,
			toolCount: p.tools?.length ?? 0,
			installCommand: QuantumIDEAICommandId.ManagePlugins,
		}));
		for (const p of getQuantumIDEPlugins()) {
			this._pluginSettings.registerKnownPluginId(p.id);
		}
		void this._loadExtensions(quantum);
	}

	private async _loadExtensions(quantum: IQuantumIDEChatPluginListing[]): Promise<void> {
		try {
			const installed = await this._extensions.getInstalled();
			const extListings: IQuantumIDEChatPluginListing[] = installed.slice(0, 40).map(e => ({
				id: e.identifier.id,
				name: e.manifest.displayName ?? e.identifier.id,
				description: e.manifest.description ?? '',
				enabled: true,
				source: 'vscode-extension' as const,
				toolCount: 0,
				installCommand: 'workbench.extensions.action.showExtensions',
			}));
			this._listings = [...quantum, ...extListings];
		} catch {
			this._listings = quantum;
		}
		this._onDidChange.fire();
	}
}

registerSingleton(IQuantumIDEChatPluginMarketplaceService, QuantumIDEChatPluginMarketplaceService, InstantiationType.Delayed);
