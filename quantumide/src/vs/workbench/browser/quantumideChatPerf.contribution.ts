/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../nls.js';
import { Action2, registerAction2 } from '../../platform/actions/common/actions.js';
import { ConfigurationScope } from '../../platform/configuration/common/configurationRegistry.js';
import { ServicesAccessor } from '../../platform/instantiation/common/instantiation.js';
import { isQuantumIDEProduct } from '../../platform/quantumide/common/quantumideChatPlatform.js';
import { QuantumIDEAICommandId, QuantumIDEAISettingId } from '../../platform/quantumide/common/quantumideAISettings.js';
import product from '../../platform/product/common/product.js';
import { IConfigurationService } from '../../platform/configuration/common/configuration.js';
import { ILogService } from '../../platform/log/common/log.js';
import { Registry } from '../../platform/registry/common/platform.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../platform/configuration/common/configurationRegistry.js';
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from '../common/contributions.js';
import { Disposable } from '../../base/common/lifecycle.js';
import { Extensions, IOutputChannelRegistry } from '../services/output/common/output.js';
import { IOutputService } from '../services/output/common/output.js';
import {
	dumpChatPerfMarksToConsole,
	setChatPerfInstrumentationSink,
	type IChatPerfInstrumentationSink,
} from '../contrib/chat/common/chatPerfInstrumentation.js';

export const QUANTUMIDE_CHAT_PERF_OUTPUT_CHANNEL_ID = 'quantumideChatPerformance';

function isQuantumIDE(): boolean {
	return isQuantumIDEProduct(product.applicationName)
		|| [product.nameShort, product.nameLong].some(n => typeof n === 'string' && n.toLowerCase().includes('quantumide'));
}

class QuantumIDEChatPerfSink implements IChatPerfInstrumentationSink {
	constructor(private readonly configurationService: IConfigurationService) { }

	isEnabled(): boolean {
		return this.configurationService.getValue<boolean>(QuantumIDEAISettingId.ChatPerfInstrumentationEnabled) === true;
	}

	isVerbose(): boolean {
		return this.configurationService.getValue<boolean>(QuantumIDEAISettingId.ChatPerfInstrumentationVerbose) === true;
	}

	logToConsole(): boolean {
		return this.configurationService.getValue<boolean>(QuantumIDEAISettingId.ChatPerfInstrumentationLogToConsole) === true;
	}

	appendLine(line: string): void {
		// Output channel is wired by contribution; use log service as fallback.
		// The contribution stores a ref on the sink wrapper below.
		QuantumIDEChatPerfContribution.appendPerfLine(line);
	}
}

class QuantumIDEChatPerfContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.quantumideChatPerf';

	private static _appendLine: ((line: string) => void) | undefined;

	static appendPerfLine(line: string): void {
		QuantumIDEChatPerfContribution._appendLine?.(line);
	}

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IOutputService private readonly outputService: IOutputService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		const registry = Registry.as<IOutputChannelRegistry>(Extensions.OutputChannels);
		if (!registry.getChannel(QUANTUMIDE_CHAT_PERF_OUTPUT_CHANNEL_ID)) {
			registry.registerChannel({
				id: QUANTUMIDE_CHAT_PERF_OUTPUT_CHANNEL_ID,
				label: localize('quantumide.chatPerf.channel', 'QuantumIDE Chat Performance'),
				log: true,
				languageId: 'log',
			});
		}
		const channel = this.outputService.getChannel(QUANTUMIDE_CHAT_PERF_OUTPUT_CHANNEL_ID);
		if (!channel) {
			throw new Error(`Failed to register ${QUANTUMIDE_CHAT_PERF_OUTPUT_CHANNEL_ID} output channel`);
		}

		QuantumIDEChatPerfContribution._appendLine = (line: string) => channel.append(line + '\n');

		const sink = new QuantumIDEChatPerfSink(this.configurationService);
		setChatPerfInstrumentationSink(sink);

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(QuantumIDEAISettingId.ChatPerfInstrumentationEnabled)
				|| e.affectsConfiguration(QuantumIDEAISettingId.ChatPerfInstrumentationVerbose)
				|| e.affectsConfiguration(QuantumIDEAISettingId.ChatPerfInstrumentationLogToConsole)) {
				setChatPerfInstrumentationSink(new QuantumIDEChatPerfSink(this.configurationService));
			}
		}));

		this._register({ dispose: () => setChatPerfInstrumentationSink(undefined) });

		if (sink.isEnabled()) {
			channel.append(localize(
				'quantumide.chatPerf.ready',
				'Chat performance instrumentation active. Dimensions: context build, UI response, message render, streaming, memory, jank, network.\n',
			) + '\n');
		}

		this.logService.trace('[QuantumIDE] Chat perf instrumentation contribution loaded');
	}
}

function registerChatPerfSettings(): void {
	Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
		id: 'quantumideChatPerf',
		title: localize('quantumide.chatPerf.settingsTitle', 'QuantumIDE Chat Performance'),
		properties: {
			[QuantumIDEAISettingId.ChatPerfInstrumentationEnabled]: {
				type: 'boolean',
				default: true,
				scope: ConfigurationScope.APPLICATION,
				description: localize('quantumide.chatPerf.enabled', 'Log chat panel timing (submit, API, first token, render chunks, memory) to the QuantumIDE Chat Performance output.'),
			},
			[QuantumIDEAISettingId.ChatPerfInstrumentationVerbose]: {
				type: 'boolean',
				default: false,
				scope: ConfigurationScope.APPLICATION,
				description: localize('quantumide.chatPerf.verbose', 'Log every stream chunk and render pass (noisy; use when debugging streaming lag).'),
			},
			[QuantumIDEAISettingId.ChatPerfInstrumentationLogToConsole]: {
				type: 'boolean',
				default: false,
				scope: ConfigurationScope.APPLICATION,
				description: localize('quantumide.chatPerf.console', 'Mirror perf lines to DevTools console (console.time / console.log) for Chrome Performance tab correlation.'),
			},
		},
	});
}

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: QuantumIDEAICommandId.ShowChatPerfOutput,
			title: localize2('quantumide.chatPerf.showOutput', 'QuantumIDE: Show Chat Performance Log'),
			category: { value: localize('quantumide.ai.category', 'QuantumIDE AI'), original: 'QuantumIDE AI' },
			f1: true,
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		await accessor.get(IOutputService).showChannel(QUANTUMIDE_CHAT_PERF_OUTPUT_CHANNEL_ID, true);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: QuantumIDEAICommandId.DumpChatPerfMarks,
			title: localize2('quantumide.chatPerf.dumpMarks', 'QuantumIDE: Dump Chat Performance Marks to Console'),
			category: { value: localize('quantumide.ai.category', 'QuantumIDE AI'), original: 'QuantumIDE AI' },
			f1: true,
		});
	}
	run(): void {
		dumpChatPerfMarksToConsole();
	}
});

if (isQuantumIDE()) {
	registerChatPerfSettings();
	registerWorkbenchContribution2(QuantumIDEChatPerfContribution.ID, QuantumIDEChatPerfContribution, WorkbenchPhase.AfterRestored);
}
