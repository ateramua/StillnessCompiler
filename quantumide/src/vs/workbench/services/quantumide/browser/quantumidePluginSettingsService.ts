/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import {
	parsePluginEnablementState,
	QUANTUMIDE_PLUGIN_SETTINGS_STORAGE_KEY,
	serializePluginEnablementState,
	type IQuantumIDEPluginEnablementState,
} from '../../../../platform/quantumide/common/quantumidePluginSettings.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';

export interface IQuantumIDEPluginSettingsService {
	readonly _serviceBrand: undefined;
	readonly onDidChange: import('../../../../base/common/event.js').Event<void>;
	getEnablement(): IQuantumIDEPluginEnablementState;
	setPluginEnabled(pluginId: string, enabled: boolean): void;
	setToolEnabled(toolId: string, enabled: boolean): void;
	listRegisteredPluginIds(): readonly string[];
	registerKnownPluginId(pluginId: string): void;
}

export const IQuantumIDEPluginSettingsService = createDecorator<IQuantumIDEPluginSettingsService>('quantumIDEPluginSettingsService');

export class QuantumIDEPluginSettingsService extends Disposable implements IQuantumIDEPluginSettingsService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private _state: IQuantumIDEPluginEnablementState;
	private readonly _knownIds = new Set<string>();

	constructor(
		@IStorageService private readonly _storageService: IStorageService,
	) {
		super();
		this._state = parsePluginEnablementState(
			this._storageService.get(QUANTUMIDE_PLUGIN_SETTINGS_STORAGE_KEY, StorageScope.APPLICATION),
		);
	}

	getEnablement(): IQuantumIDEPluginEnablementState {
		return this._state;
	}

	setPluginEnabled(pluginId: string, enabled: boolean): void {
		this.registerKnownPluginId(pluginId);
		const enabledIds = new Set(this._state.enabledPluginIds);
		const allKnown = [...this._knownIds];
		if (enabledIds.size === 0 && allKnown.length > 0) {
			for (const id of allKnown) {
				enabledIds.add(id);
			}
		}
		if (enabled) {
			enabledIds.add(pluginId);
		} else {
			enabledIds.delete(pluginId);
		}
		this._persist({ ...this._state, enabledPluginIds: [...enabledIds] });
	}

	setToolEnabled(toolId: string, enabled: boolean): void {
		const disabled = new Set(this._state.disabledToolIds);
		if (enabled) {
			disabled.delete(toolId);
		} else {
			disabled.add(toolId);
		}
		this._persist({ ...this._state, disabledToolIds: [...disabled] });
	}

	listRegisteredPluginIds(): readonly string[] {
		return [...this._knownIds];
	}

	registerKnownPluginId(pluginId: string): void {
		this._knownIds.add(pluginId);
	}

	private _persist(state: IQuantumIDEPluginEnablementState): void {
		this._state = state;
		this._storageService.store(
			QUANTUMIDE_PLUGIN_SETTINGS_STORAGE_KEY,
			serializePluginEnablementState(state),
			StorageScope.APPLICATION,
			StorageTarget.USER,
		);
		this._onDidChange.fire();
	}
}

registerSingleton(IQuantumIDEPluginSettingsService, QuantumIDEPluginSettingsService, InstantiationType.Delayed);
