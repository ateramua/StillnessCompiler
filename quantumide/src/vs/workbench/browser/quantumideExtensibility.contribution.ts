/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../nls.js';
import { Action2, registerAction2 } from '../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../platform/instantiation/common/instantiation.js';
import {
	getQuantumIDEPlugins,
	registerQuantumIDEPlugin,
	type IQuantumIDEPluginContribution,
} from '../../platform/quantumide/common/quantumidePluginRegistry.js';
import { INotificationService } from '../../platform/notification/common/notification.js';

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'quantumide.extensibility.listPlugins',
			title: localize2('quantumide.extensibility.listPlugins', 'QuantumIDE: List Registered Plugins'),
			category: { value: localize('quantumide.ai.category', 'QuantumIDE AI'), original: 'QuantumIDE AI' },
			f1: true,
		});
	}
	override async run(accessor: ServicesAccessor): Promise<void> {
		const plugins = getQuantumIDEPlugins();
		if (plugins.length === 0) {
			accessor.get(INotificationService).info(localize('quantumide.extensibility.none', 'No QuantumIDE plugins registered. Use registerQuantumIDEPlugin from an extension.'));
			return;
		}
		const body = plugins.map(plugin => {
			const tools = plugin.tools?.map(tool => tool.id).join(', ') ?? 'none';
			return `${plugin.id}: tools=[${tools}]${plugin.retrievalProvider ? ' +retrieval' : ''}`;
		}).join('\n');
		accessor.get(INotificationService).info(body);
	}
});

/** Built-in sample plugin demonstrating §7 custom tools and retrieval (disabled unless registered). */
export function registerQuantumIDEDemoPlugin(): { dispose(): void } {
	const contribution: IQuantumIDEPluginContribution = {
		id: 'quantumide.builtin.demo',
		customPromptPrefix: 'Demo plugin: prefer concise architectural answers.',
		tools: [{
			id: 'demo_echo',
			name: 'demo_echo',
			description: 'Echoes a message for plugin tool wiring tests.',
			handler: 'host',
			execute: async args => `echo: ${String(args.message ?? '')}`,
			parameters: {
				type: 'object',
				properties: { message: { type: 'string' } },
				required: ['message'],
			},
		}, {
			id: 'demo_client_status',
			name: 'demo_client_status',
			description: 'Returns plugin client-tool status from the workbench.',
			handler: 'client',
			execute: async () => 'QuantumIDE plugin client tools are active.',
			parameters: { type: 'object', properties: {} },
		}],
	};
	return registerQuantumIDEPlugin(contribution);
}

registerQuantumIDEDemoPlugin();
