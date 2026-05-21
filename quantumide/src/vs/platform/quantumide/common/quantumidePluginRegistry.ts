/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { isQuantumIDEPluginEnabled, isQuantumIDEPluginToolEnabled, type IQuantumIDEPluginEnablementState } from './quantumidePluginSettings.js';

export type QuantumIDEPluginHostToolExecutor = (args: Record<string, unknown>) => Promise<string>;

export interface IQuantumIDEPluginToolDefinition {
	readonly id: string;
	readonly name: string;
	readonly description: string;
	readonly handler: 'host' | 'client';
	readonly parameters?: Record<string, unknown>;
	readonly execute?: QuantumIDEPluginHostToolExecutor;
}

export interface IQuantumIDEExternalRetrievalProvider {
	readonly id: string;
	search(query: string, maxResults: number): Promise<readonly { path: string; excerpt: string }[]>;
}

export interface IQuantumIDEPluginContribution {
	readonly id: string;
	readonly customPromptPrefix?: string;
	readonly tools?: readonly IQuantumIDEPluginToolDefinition[];
	readonly retrievalProvider?: IQuantumIDEExternalRetrievalProvider;
}

const contributions = new Map<string, IQuantumIDEPluginContribution>();

export function registerQuantumIDEPlugin(contribution: IQuantumIDEPluginContribution): { dispose(): void } {
	contributions.set(contribution.id, contribution);
	return { dispose: () => contributions.delete(contribution.id) };
}

export function getQuantumIDEPlugins(enablement?: IQuantumIDEPluginEnablementState): readonly IQuantumIDEPluginContribution[] {
	const all = [...contributions.values()];
	if (!enablement) {
		return all;
	}
	const ids = all.map(p => p.id);
	return all.filter(p => isQuantumIDEPluginEnabled(p.id, enablement, ids));
}

export function getQuantumIDEPluginPromptAddons(enablement?: IQuantumIDEPluginEnablementState): string {
	return getQuantumIDEPlugins(enablement)
		.map(p => p.customPromptPrefix)
		.filter((p): p is string => !!p?.trim())
		.join('\n');
}

export function getQuantumIDEPluginHostTools(enablement?: IQuantumIDEPluginEnablementState): readonly IQuantumIDEPluginToolDefinition[] {
	const tools: IQuantumIDEPluginToolDefinition[] = [];
	for (const plugin of getQuantumIDEPlugins(enablement)) {
		if (!plugin.tools) {
			continue;
		}
		for (const tool of plugin.tools) {
			if (tool.handler === 'host' && tool.execute && isQuantumIDEPluginToolEnabled(tool.id, enablement ?? { enabledPluginIds: [], disabledToolIds: [] })) {
				tools.push(tool);
			}
		}
	}
	return tools;
}

export function getQuantumIDEPluginClientTools(enablement?: IQuantumIDEPluginEnablementState): readonly IQuantumIDEPluginToolDefinition[] {
	const tools: IQuantumIDEPluginToolDefinition[] = [];
	for (const plugin of getQuantumIDEPlugins(enablement)) {
		if (!plugin.tools) {
			continue;
		}
		for (const tool of plugin.tools) {
			if (tool.handler === 'client' && tool.execute && isQuantumIDEPluginToolEnabled(tool.id, enablement ?? { enabledPluginIds: [], disabledToolIds: [] })) {
				tools.push(tool);
			}
		}
	}
	return tools;
}

export function isQuantumIDEPluginClientTool(toolName: string): boolean {
	return getQuantumIDEPluginClientTools().some(tool => tool.id === toolName || tool.name === toolName);
}

export async function executeQuantumIDEPluginClientTool(toolName: string, args: Record<string, unknown>): Promise<string | undefined> {
	for (const tool of getQuantumIDEPluginClientTools()) {
		if (tool.id === toolName || tool.name === toolName) {
			return tool.execute!(args);
		}
	}
	return undefined;
}

export function isQuantumIDEPluginHostTool(toolName: string): boolean {
	return getQuantumIDEPluginHostTools().some(tool => tool.id === toolName || tool.name === toolName);
}

export async function executeQuantumIDEPluginHostTool(toolName: string, args: Record<string, unknown>): Promise<string | undefined> {
	for (const tool of getQuantumIDEPluginHostTools()) {
		if (tool.id === toolName || tool.name === toolName) {
			return tool.execute!(args);
		}
	}
	return undefined;
}

export function getQuantumIDEPluginHostToolDefinitions(): readonly {
	readonly type: 'function';
	readonly function: {
		readonly name: string;
		readonly description: string;
		readonly parameters: Record<string, unknown>;
	};
}[] {
	return getQuantumIDEPluginHostTools().map(tool => ({
		type: 'function' as const,
		function: {
			name: tool.id,
			description: tool.description,
			parameters: tool.parameters ?? {
				type: 'object',
				properties: {},
				additionalProperties: true,
			},
		},
	}));
}
