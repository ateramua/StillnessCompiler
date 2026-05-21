/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

export const QUANTUMIDE_PLUGIN_SETTINGS_STORAGE_KEY = 'quantumide.plugins.enabled';

export interface IQuantumIDEPluginEnablementState {
	readonly enabledPluginIds: readonly string[];
	readonly disabledToolIds: readonly string[];
}

export function parsePluginEnablementState(raw: string | undefined): IQuantumIDEPluginEnablementState {
	if (!raw) {
		return { enabledPluginIds: [], disabledToolIds: [] };
	}
	try {
		const parsed = JSON.parse(raw) as Partial<IQuantumIDEPluginEnablementState>;
		return {
			enabledPluginIds: Array.isArray(parsed.enabledPluginIds) ? parsed.enabledPluginIds.filter(id => typeof id === 'string') : [],
			disabledToolIds: Array.isArray(parsed.disabledToolIds) ? parsed.disabledToolIds.filter(id => typeof id === 'string') : [],
		};
	} catch {
		return { enabledPluginIds: [], disabledToolIds: [] };
	}
}

export function serializePluginEnablementState(state: IQuantumIDEPluginEnablementState): string {
	return JSON.stringify(state);
}

/** When no explicit enable list, all registered plugins are enabled. */
export function isQuantumIDEPluginEnabled(pluginId: string, state: IQuantumIDEPluginEnablementState, registeredIds: readonly string[]): boolean {
	if (state.enabledPluginIds.length === 0) {
		return registeredIds.includes(pluginId);
	}
	return state.enabledPluginIds.includes(pluginId);
}

export function isQuantumIDEPluginToolEnabled(toolId: string, state: IQuantumIDEPluginEnablementState): boolean {
	return !state.disabledToolIds.includes(toolId);
}
