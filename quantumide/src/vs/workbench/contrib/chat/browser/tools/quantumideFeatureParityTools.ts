/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { getQuantumIDEPlugins } from '../../../../../platform/quantumide/common/quantumidePluginRegistry.js';
import { IQuantumIDEPluginSettingsService } from '../../../../services/quantumide/browser/quantumidePluginSettingsService.js';
import { IQuantumIDEUnifiedEditPipelineService } from '../../../../services/quantumide/common/quantumideUnifiedEditPipeline.js';
import { IQuantumIDEAgentStepGateService } from '../../../../services/quantumide/common/quantumideAgentStepGate.js';
import { QuantumIDEAISettingId } from '../../../../../platform/quantumide/common/quantumideAISettings.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { IQuantumIDEFileNavigationService } from '../../../../services/quantumide/browser/quantumideFileNavigationService.js';
import { IQuantumIDEOnboardingService } from '../../../../services/quantumide/browser/quantumideOnboardingService.js';
import { CountTokensCallback, ILanguageModelToolsService, IToolData, IToolImpl, IToolInvocation, IToolResult, ToolDataSource, ToolProgress } from '../../common/tools/languageModelToolsService.js';
import { createToolSimpleTextResult } from '../../common/tools/builtinTools/toolHelpers.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';

const WHEN = ContextKeyExpr.equals(`config.${QuantumIDEAISettingId.ChatFeatureParityEnabled}`, true);

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

export const QuantumIDEOpenFileToolId = 'quantumide_open_file';
export const QuantumIDEBrowseTreeToolId = 'quantumide_browse_workspace_tree';
export const QuantumIDEGoToLineToolId = 'quantumide_go_to_line';
export const QuantumIDEPreviewRefactorToolId = 'quantumide_preview_refactor';
export const QuantumIDEStageChatEditsToolId = 'quantumide_stage_chat_edits';
export const QuantumIDEListPluginsToolId = 'quantumide_list_plugins';
export const QuantumIDEOnboardingToolId = 'quantumide_show_chat_onboarding';

class QuantumIDEOpenFileTool implements IToolImpl {
	constructor(@IQuantumIDEFileNavigationService private readonly _nav: IQuantumIDEFileNavigationService) { }
	getToolData(): IToolData {
		return toolData(QuantumIDEOpenFileToolId, localize('quantumide.tool.openFile', 'Open File'),
			'Open a workspace file in the editor, optionally at a line and column.',
			{
				type: 'object',
				properties: {
					path: { type: 'string' },
					line: { type: 'number' },
					column: { type: 'number' },
				},
				required: ['path'],
			});
	}
	async invoke(invocation: IToolInvocation, _c: CountTokensCallback, _p: ToolProgress, _t: CancellationToken): Promise<IToolResult> {
		const p = invocation.parameters as { path?: string; line?: number; column?: number };
		const ok = await this._nav.openFile(String(p.path ?? ''), p.line, p.column);
		return createToolSimpleTextResult(ok ? `Opened ${p.path}` : `Could not open ${p.path}`);
	}
}

class QuantumIDEBrowseTreeTool implements IToolImpl {
	constructor(@IQuantumIDEFileNavigationService private readonly _nav: IQuantumIDEFileNavigationService) { }
	getToolData(): IToolData {
		return toolData(QuantumIDEBrowseTreeToolId, localize('quantumide.tool.browseTree', 'Browse Workspace Tree'),
			'List files and folders from the indexed workspace tree for chat file navigation.',
			{
				type: 'object',
				properties: {
					prefix: { type: 'string', description: 'Optional folder prefix filter.' },
					maxEntries: { type: 'number' },
				},
			});
	}
	async invoke(invocation: IToolInvocation, _c: CountTokensCallback, _p: ToolProgress, _t: CancellationToken): Promise<IToolResult> {
		const p = invocation.parameters as { prefix?: string; maxEntries?: number };
		const entries = await this._nav.listWorkspaceTree(p.maxEntries ?? 150, p.prefix);
		const body = entries.map(e => `${e.isDirectory ? '[dir]' : '[file]'} ${e.path}`).join('\n');
		return createToolSimpleTextResult(body || 'Workspace tree is empty. Run reindex if needed.');
	}
}

class QuantumIDEGoToLineTool implements IToolImpl {
	constructor(@IQuantumIDEFileNavigationService private readonly _nav: IQuantumIDEFileNavigationService) { }
	getToolData(): IToolData {
		return toolData(QuantumIDEGoToLineToolId, localize('quantumide.tool.goToLine', 'Go To Line'),
			'Open a file and move the cursor to a specific line.',
			{
				type: 'object',
				properties: { path: { type: 'string' }, line: { type: 'number' }, column: { type: 'number' } },
				required: ['path', 'line'],
			});
	}
	async invoke(invocation: IToolInvocation, _c: CountTokensCallback, _p: ToolProgress, _t: CancellationToken): Promise<IToolResult> {
		const p = invocation.parameters as { path?: string; line?: number; column?: number };
		const ok = await this._nav.goToLine(String(p.path ?? ''), Number(p.line ?? 1), p.column);
		return createToolSimpleTextResult(ok ? `Navigated to ${p.path}:${p.line}` : 'Navigation failed.');
	}
}

class QuantumIDEPreviewRefactorTool implements IToolImpl {
	constructor(
		@IQuantumIDEUnifiedEditPipelineService private readonly _pipeline: IQuantumIDEUnifiedEditPipelineService,
	) { }
	getToolData(): IToolData {
		return toolData(QuantumIDEPreviewRefactorToolId, localize('quantumide.tool.previewRefactor', 'Preview Multi-File Refactor'),
			'Open visual multi-file diff review for coordinated refactor edits before applying.',
			{
				type: 'object',
				properties: {
					edits: {
						type: 'array',
						items: {
							type: 'object',
							properties: { path: { type: 'string' }, content: { type: 'string' } },
							required: ['path', 'content'],
						},
					},
				},
				required: ['edits'],
			});
	}
	async invoke(invocation: IToolInvocation, _c: CountTokensCallback, _p: ToolProgress, _t: CancellationToken): Promise<IToolResult> {
		const p = invocation.parameters as { edits?: { path: string; content: string }[] };
		const edits = p.edits ?? [];
		await this._pipeline.proposeEdits(edits, 'Multi-file refactor preview');
		return createToolSimpleTextResult(`Staged ${edits.length} file(s) in unified edit review. Pending: ${this._pipeline.getPendingCount()}.`);
	}
}

class QuantumIDEStageChatEditsTool implements IToolImpl {
	constructor(
		@IQuantumIDEUnifiedEditPipelineService private readonly _pipeline: IQuantumIDEUnifiedEditPipelineService,
		@IQuantumIDEAgentStepGateService private readonly _gate: IQuantumIDEAgentStepGateService,
	) { }
	getToolData(): IToolData {
		return toolData(QuantumIDEStageChatEditsToolId, localize('quantumide.tool.stageChatEdits', 'Stage Chat Edits'),
			'Stage proposed file edits from chat with visual diff; user accepts via diff review or accept_all.',
			{
				type: 'object',
				properties: {
					edits: {
						type: 'array',
						items: {
							type: 'object',
							properties: { path: { type: 'string' }, content: { type: 'string' } },
							required: ['path', 'content'],
						},
					},
				},
				required: ['edits'],
			});
	}
	async invoke(invocation: IToolInvocation, _c: CountTokensCallback, _p: ToolProgress, _t: CancellationToken): Promise<IToolResult> {
		await this._gate.awaitGate(QuantumIDEStageChatEditsToolId);
		const p = invocation.parameters as { edits?: { path: string; content: string }[] };
		await this._pipeline.proposeEdits(p.edits ?? [], 'Chat staged edits');
		this._gate.notifyToolCompleted(QuantumIDEStageChatEditsToolId);
		return createToolSimpleTextResult(`Staged ${p.edits?.length ?? 0} edit(s) for unified review. Pending: ${this._pipeline.getPendingCount()}.`);
	}
}

class QuantumIDEListPluginsTool implements IToolImpl {
	constructor(@IQuantumIDEPluginSettingsService private readonly _pluginSettings: IQuantumIDEPluginSettingsService) { }
	getToolData(): IToolData {
		return toolData(QuantumIDEListPluginsToolId, localize('quantumide.tool.listPlugins', 'List Plugins'),
			'List registered QuantumIDE plugins and their tools/retrieval providers.',
			{ type: 'object', properties: {}, additionalProperties: false });
	}
	async invoke(_invocation: IToolInvocation, _c: CountTokensCallback, _p: ToolProgress, _t: CancellationToken): Promise<IToolResult> {
		for (const plugin of getQuantumIDEPlugins()) {
			this._pluginSettings.registerKnownPluginId(plugin.id);
		}
		const enablement = this._pluginSettings.getEnablement();
		const plugins = getQuantumIDEPlugins(enablement);
		if (plugins.length === 0) {
			return createToolSimpleTextResult('No plugins registered. Use registerQuantumIDEPlugin from an extension.');
		}
		const body = plugins.map(pl => {
			const tools = pl.tools?.map(t => `${t.id}(${t.handler})`).join(', ') ?? 'none';
			return `- ${pl.id}: tools=[${tools}]${pl.retrievalProvider ? ' +retrieval' : ''}`;
		}).join('\n');
		return createToolSimpleTextResult(body);
	}
}

class QuantumIDEOnboardingTool implements IToolImpl {
	constructor(@IQuantumIDEOnboardingService private readonly _onboarding: IQuantumIDEOnboardingService) { }
	getToolData(): IToolData {
		return toolData(QuantumIDEOnboardingToolId, localize('quantumide.tool.onboarding', 'Show Chat Onboarding'),
			'Show QuantumIDE chat onboarding tips and feature discovery guidance.',
			{ type: 'object', properties: {}, additionalProperties: false });
	}
	async invoke(_invocation: IToolInvocation, _c: CountTokensCallback, _p: ToolProgress, _t: CancellationToken): Promise<IToolResult> {
		return createToolSimpleTextResult(this._onboarding.formatOnboardingMessage());
	}
}

interface IQuantumIDEToolWithData extends IToolImpl {
	getToolData(): IToolData;
}

export class QuantumIDEFeatureParityToolsContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.quantumideFeatureParityTools';

	constructor(
		@ILanguageModelToolsService toolsService: ILanguageModelToolsService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		const types = [
			QuantumIDEOpenFileTool,
			QuantumIDEBrowseTreeTool,
			QuantumIDEGoToLineTool,
			QuantumIDEPreviewRefactorTool,
			QuantumIDEStageChatEditsTool,
			QuantumIDEListPluginsTool,
			QuantumIDEOnboardingTool,
		] as const;
		for (const ToolType of types) {
			const tool = instantiationService.createInstance(ToolType) as IQuantumIDEToolWithData;
			this._store.add(toolsService.registerTool(tool.getToolData(), tool));
		}
	}
}
