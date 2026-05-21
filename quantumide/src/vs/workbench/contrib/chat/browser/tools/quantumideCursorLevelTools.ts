/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { evaluateQuantumIDECommandPolicy, filterMatchingCommands } from '../../../../../platform/quantumide/common/quantumideCommandPolicy.js';
import { formatTestRunSummary, parseTestOutput } from '../../../../../platform/quantumide/common/quantumideTestOutputParser.js';
import { QuantumIDEAISettingId } from '../../../../../platform/quantumide/common/quantumideAISettings.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { IQuantumIDECommandAuditService } from '../../../../services/quantumide/browser/quantumideCommandAuditService.js';
import { CountTokensCallback, ILanguageModelToolsService, IToolData, IToolImpl, IToolInvocation, IToolResult, ToolDataSource, ToolProgress } from '../../common/tools/languageModelToolsService.js';
import { createToolSimpleTextResult } from '../../common/tools/builtinTools/toolHelpers.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';

const WHEN = ContextKeyExpr.or(
	ContextKeyExpr.equals(`config.${QuantumIDEAISettingId.ChatCursorParityEnabled}`, true),
	ContextKeyExpr.equals(`config.${QuantumIDEAISettingId.ChatFeatureParityEnabled}`, true),
);

function toolData(id: string, displayName: string, modelDescription: string, inputSchema: IToolData['inputSchema']): IToolData {
	return {
		id,
		displayName,
		modelDescription,
		userDescription: displayName,
		source: ToolDataSource.Internal,
		when: WHEN,
		icon: ThemeIcon.fromId(Codicon.sparkle.id),
		inputSchema,
	};
}

export const QuantumIDEListMatchingCommandsToolId = 'quantumide_list_matching_commands';
export const QuantumIDEParseTestOutputToolId = 'quantumide_parse_test_output';

class QuantumIDEListMatchingCommandsTool implements IToolImpl {
	getToolData(): IToolData {
		return toolData(
			QuantumIDEListMatchingCommandsToolId,
			localize('quantumide.tool.listCommands', 'List Matching Commands'),
			'Search workbench command palette commands by intent string. Use before execute_workbench_command.',
			{
				type: 'object',
				properties: {
					query: { type: 'string' },
					maxResults: { type: 'number' },
				},
				required: ['query'],
			},
		);
	}
	async invoke(invocation: IToolInvocation, _c: CountTokensCallback, _p: ToolProgress, _t: CancellationToken): Promise<IToolResult> {
		const p = invocation.parameters as { query?: string; maxResults?: number };
		const ids = [...CommandsRegistry.getCommands().keys()];
		const matches = filterMatchingCommands(String(p.query ?? ''), ids, p.maxResults ?? 25);
		return createToolSimpleTextResult(matches.map(id => `- ${id}`).join('\n') || 'No matching commands.');
	}
}

class QuantumIDEParseTestOutputTool implements IToolImpl {
	getToolData(): IToolData {
		return toolData(
			QuantumIDEParseTestOutputToolId,
			localize('quantumide.tool.parseTests', 'Parse Test Output'),
			'Parse jest/vitest/pytest/mocha terminal output into structured pass/fail summary for chat UI.',
			{
				type: 'object',
				properties: {
					output: { type: 'string' },
					frameworkHint: { type: 'string' },
				},
				required: ['output'],
			},
		);
	}
	async invoke(invocation: IToolInvocation, _c: CountTokensCallback, _p: ToolProgress, _t: CancellationToken): Promise<IToolResult> {
		const p = invocation.parameters as { output?: string; frameworkHint?: string };
		const summary = parseTestOutput(String(p.output ?? ''), p.frameworkHint);
		return createToolSimpleTextResult(formatTestRunSummary(summary));
	}
}

/** Patched execute command tool behavior is applied via contribution wrapper on registration order — policy enforced in chat parity tool file. */
export function wrapQuantumIDECommandExecution(
	commandService: ICommandService,
	audit: IQuantumIDECommandAuditService,
	configurationService: IConfigurationService,
	commandId: string,
	args: unknown,
	source: string,
): Promise<unknown> {
	const policy = evaluateQuantumIDECommandPolicy(commandId, {
		dangerousBlockEnabled: configurationService.getValue<boolean>(QuantumIDEAISettingId.AgentDangerousCommandBlock) !== false,
	});
	if (!policy.allowed) {
		audit.append({ commandId, source, success: false, detail: policy.reason });
		return Promise.reject(new Error(policy.reason ?? 'Blocked'));
	}
	return commandService.executeCommand(commandId, args).then(
		result => {
			audit.append({ commandId, source, success: true });
			return result;
		},
		err => {
			audit.append({ commandId, source, success: false, detail: err instanceof Error ? err.message : String(err) });
			throw err;
		},
	);
}

interface IQuantumIDEToolWithData extends IToolImpl {
	getToolData(): IToolData;
}

export class QuantumIDECursorLevelToolsContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.quantumideCursorLevelTools';

	constructor(
		@ILanguageModelToolsService toolsService: ILanguageModelToolsService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		for (const ToolType of [QuantumIDEListMatchingCommandsTool, QuantumIDEParseTestOutputTool] as const) {
			const tool = instantiationService.createInstance(ToolType) as IQuantumIDEToolWithData;
			this._store.add(toolsService.registerTool(tool.getToolData(), tool));
		}
	}
}
