/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import {
	executeQuantumIDEPluginClientTool,
	executeQuantumIDEPluginHostTool,
	getQuantumIDEPlugins,
	type IQuantumIDEPluginToolDefinition,
} from '../../../../platform/quantumide/common/quantumidePluginRegistry.js';
import { IQuantumIDEPluginSettingsService } from './quantumidePluginSettingsService.js';

export interface IQuantumIDEPluginInvokeRequest {
	readonly pluginId?: string;
	readonly toolId: string;
	readonly args?: Record<string, unknown>;
}

export interface IQuantumIDEPluginInvokeResult {
	readonly success: boolean;
	readonly output: string;
}

export interface IQuantumIDEPluginBridgeService {
	readonly _serviceBrand: undefined;
	listTools(): readonly { pluginId: string; tool: IQuantumIDEPluginToolDefinition }[];
	invoke(request: IQuantumIDEPluginInvokeRequest): Promise<IQuantumIDEPluginInvokeResult>;
}

export const IQuantumIDEPluginBridgeService = createDecorator<IQuantumIDEPluginBridgeService>('quantumIDEPluginBridgeService');

export class QuantumIDEPluginBridgeService implements IQuantumIDEPluginBridgeService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IQuantumIDEPluginSettingsService private readonly _pluginSettings: IQuantumIDEPluginSettingsService,
	) { }

	listTools(): readonly { pluginId: string; tool: IQuantumIDEPluginToolDefinition }[] {
		const enablement = this._pluginSettings.getEnablement();
		const out: { pluginId: string; tool: IQuantumIDEPluginToolDefinition }[] = [];
		for (const plugin of getQuantumIDEPlugins(enablement)) {
			for (const tool of plugin.tools ?? []) {
				out.push({ pluginId: plugin.id, tool });
			}
		}
		return out;
	}

	async invoke(request: IQuantumIDEPluginInvokeRequest): Promise<IQuantumIDEPluginInvokeResult> {
		const args = request.args ?? {};
		const client = await executeQuantumIDEPluginClientTool(request.toolId, args);
		if (client !== undefined) {
			return { success: true, output: client };
		}
		const host = await executeQuantumIDEPluginHostTool(request.toolId, args);
		if (host !== undefined) {
			return { success: true, output: host };
		}
		return { success: false, output: `Plugin tool not found or disabled: ${request.toolId}` };
	}
}

registerSingleton(IQuantumIDEPluginBridgeService, QuantumIDEPluginBridgeService, InstantiationType.Delayed);
