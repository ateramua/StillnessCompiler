/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { QuantumIDEAISettingId } from '../../../../../platform/quantumide/common/quantumideAISettings.js';
import { buildProjectScaffold, detectScaffoldKindFromPrompt, formatScaffoldPlan, type QuantumIDEProjectScaffoldKind } from '../../../../../platform/quantumide/common/quantumideProjectScaffold.js';
import { formatFrameworkWorkflowResult, runFrameworkWorkflow, type QuantumIDEFrameworkWorkflowAction } from '../../../../../platform/quantumide/common/quantumideFrameworkWorkflows.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { IQuantumIDEChatEditSessionService } from '../../../../services/quantumide/browser/quantumideChatEditSessionService.js';
import { IQuantumIDEContextExpansionService } from '../../../../services/quantumide/browser/quantumideContextExpansionService.js';
import { IQuantumIDEReplSessionService } from '../../../../services/quantumide/browser/quantumideReplSessionService.js';
import { CountTokensCallback, ILanguageModelToolsService, IToolData, IToolImpl, IToolInvocation, IToolResult, ToolDataSource, ToolProgress } from '../../common/tools/languageModelToolsService.js';
import { createToolSimpleTextResult } from '../../common/tools/builtinTools/toolHelpers.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ISCMService } from '../../../scm/common/scm.js';
import { buildCodeReviewReport, formatCodeReviewReport } from '../../../../../platform/quantumide/common/quantumideCodeReviewAnalyzer.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';

const WHEN = ContextKeyExpr.equals(`config.${QuantumIDEAISettingId.ChatFeatureParityEnabled}`, true);

function toolData(id: string, displayName: string, modelDescription: string, inputSchema: IToolData['inputSchema']): IToolData {
	return {
		id, displayName, modelDescription, userDescription: displayName,
		source: ToolDataSource.Internal, when: WHEN, icon: ThemeIcon.fromId(Codicon.sparkle.id), inputSchema,
	};
}

export const QuantumIDERunReplToolId = 'quantumide_run_repl';
export const QuantumIDEExpandContextToolId = 'quantumide_expand_context';
export const QuantumIDECodeReviewToolId = 'quantumide_code_review';
export const QuantumIDEScaffoldPreviewToolId = 'quantumide_scaffold_preview';
export const QuantumIDEFrameworkWorkflowToolId = 'quantumide_framework_workflow';
export const QuantumIDEGitStatusToolId = 'quantumide_git_status';

class QuantumIDERunReplTool implements IToolImpl {
	constructor(@IQuantumIDEReplSessionService private readonly _repl: IQuantumIDEReplSessionService) { }
	getToolData(): IToolData {
		return toolData(QuantumIDERunReplToolId, localize('quantumide.tool.repl', 'Run REPL Snippet'),
			'Execute code in a persistent REPL session with inline stdout/stderr formatting.',
			{ type: 'object', properties: { code: { type: 'string' }, language: { type: 'string' }, sessionId: { type: 'string' } }, required: ['code'] });
	}
	async invoke(inv: IToolInvocation, _c: CountTokensCallback, _p: ToolProgress, _t: CancellationToken): Promise<IToolResult> {
		const p = inv.parameters as { code?: string; language?: string; sessionId?: string };
		const r = await this._repl.runInSession(p.language, String(p.code ?? ''), p.sessionId);
		return createToolSimpleTextResult(`${r.formatted}\n\nReuse sessionId: ${r.sessionId}`);
	}
}

class QuantumIDEExpandContextTool implements IToolImpl {
	constructor(@IQuantumIDEContextExpansionService private readonly _expansion: IQuantumIDEContextExpansionService) { }
	getToolData(): IToolData {
		return toolData(QuantumIDEExpandContextToolId, localize('quantumide.tool.expandContext', 'Expand Query Context'),
			'Auto-load related files, symbols, and excerpts for a user query.',
			{ type: 'object', properties: { query: { type: 'string' }, maxHits: { type: 'number' } }, required: ['query'] });
	}
	async invoke(inv: IToolInvocation, _c: CountTokensCallback, _p: ToolProgress, _t: CancellationToken): Promise<IToolResult> {
		const p = inv.parameters as { query?: string; maxHits?: number };
		return createToolSimpleTextResult(await this._expansion.expandForQuery(String(p.query ?? ''), p.maxHits));
	}
}

class QuantumIDECodeReviewTool implements IToolImpl {
	constructor(
		@IFileService private readonly _files: IFileService,
		@IWorkspaceContextService private readonly _workspace: IWorkspaceContextService,
		@ISCMService private readonly _scm: ISCMService,
	) { }
	getToolData(): IToolData {
		return toolData(QuantumIDECodeReviewToolId, localize('quantumide.tool.codeReview', 'Code Review Analysis'),
			'Analyze files for review findings with severity levels and suggestions.',
			{ type: 'object', properties: { paths: { type: 'array', items: { type: 'string' } }, includeScmChanges: { type: 'boolean' } } });
	}
	async invoke(inv: IToolInvocation, _c: CountTokensCallback, _p: ToolProgress, _t: CancellationToken): Promise<IToolResult> {
		const p = inv.parameters as { paths?: string[]; includeScmChanges?: boolean };
		const root = this._workspace.getWorkspace().folders[0]?.uri;
		const files: { path: string; content: string }[] = [];
		for (const path of (p.paths ?? []).slice(0, 15)) {
			if (!root) { break; }
			try {
				files.push({ path, content: (await this._files.readFile(joinPath(root, path))).value.toString() });
			} catch { /* skip */ }
		}
		if (p.includeScmChanges !== false) {
			for (const repo of this._scm.repositories) {
				for (const group of repo.provider.groups) {
					for (const resource of group.resources.slice(0, 10)) {
						const path = resource.sourceUri.path.replace(root?.path ?? '', '').replace(/^\//, '');
						if (path && !files.some(f => f.path === path)) {
							try {
								files.push({ path, content: (await this._files.readFile(resource.sourceUri)).value.toString() });
							} catch { /* skip */ }
						}
					}
				}
			}
		}
		return createToolSimpleTextResult(formatCodeReviewReport(buildCodeReviewReport(files)));
	}
}

class QuantumIDEScaffoldPreviewTool implements IToolImpl {
	constructor(@IQuantumIDEChatEditSessionService private readonly _edits: IQuantumIDEChatEditSessionService) { }
	getToolData(): IToolData {
		return toolData(QuantumIDEScaffoldPreviewToolId, localize('quantumide.tool.scaffoldPreview', 'Preview Project Scaffold'),
			'Generate project scaffold files and stage for diff review.',
			{ type: 'object', properties: { kind: { type: 'string' }, projectName: { type: 'string' }, prompt: { type: 'string' }, stage: { type: 'boolean' } } });
	}
	async invoke(inv: IToolInvocation, _c: CountTokensCallback, _p: ToolProgress, _t: CancellationToken): Promise<IToolResult> {
		const p = inv.parameters as { kind?: string; projectName?: string; prompt?: string; stage?: boolean };
		const kind = (p.kind as QuantumIDEProjectScaffoldKind | undefined) ?? detectScaffoldKindFromPrompt(String(p.prompt ?? '')) ?? 'react-vite';
		const plan = buildProjectScaffold(kind, p.projectName ?? 'my-app');
		if (p.stage === true) {
			await this._edits.stageFromProposedEdits(plan.files.map(f => ({ path: f.path, content: f.content })), plan.title);
		}
		return createToolSimpleTextResult(formatScaffoldPlan(plan));
	}
}

class QuantumIDEFrameworkWorkflowTool implements IToolImpl {
	constructor(@IQuantumIDEChatEditSessionService private readonly _edits: IQuantumIDEChatEditSessionService) { }
	getToolData(): IToolData {
		return toolData(QuantumIDEFrameworkWorkflowToolId, localize('quantumide.tool.frameworkWorkflow', 'Framework Workflow'),
			'Generate framework-specific artifacts (React component, Next API route, etc.) and optionally stage for review.',
			{ type: 'object', properties: { action: { type: 'string' }, name: { type: 'string' }, route: { type: 'string' }, stage: { type: 'boolean' } }, required: ['action', 'name'] });
	}
	async invoke(inv: IToolInvocation, _c: CountTokensCallback, _p: ToolProgress, _t: CancellationToken): Promise<IToolResult> {
		const p = inv.parameters as { action?: string; name?: string; route?: string; stage?: boolean };
		const result = runFrameworkWorkflow((p.action ?? 'add_react_component') as QuantumIDEFrameworkWorkflowAction, { name: String(p.name ?? 'Component'), route: p.route });
		if (p.stage === true) {
			await this._edits.stageFromProposedEdits(result.edits.map(e => ({ path: e.path, content: e.content })), result.summary);
		}
		return createToolSimpleTextResult(formatFrameworkWorkflowResult(result));
	}
}

class QuantumIDEGitStatusTool implements IToolImpl {
	constructor(@ISCMService private readonly _scm: ISCMService) { }
	getToolData(): IToolData {
		return toolData(QuantumIDEGitStatusToolId, localize('quantumide.tool.gitStatus', 'Git / SCM Status'),
			'Summarize current SCM changes for chat-driven git workflows.',
			{ type: 'object', properties: {} });
	}
	async invoke(_inv: IToolInvocation, _c: CountTokensCallback, _p: ToolProgress, _t: CancellationToken): Promise<IToolResult> {
		const lines: string[] = ['SCM repositories:'];
		for (const repo of this._scm.repositories) {
			lines.push(`\n## ${repo.provider.label}`);
			for (const group of repo.provider.groups) {
				if (group.resources.length === 0) { continue; }
				lines.push(`### ${group.label} (${group.resources.length})`);
				for (const r of group.resources.slice(0, 25)) {
					lines.push(`- ${r.sourceUri.fsPath} [${group.label}]`);
				}
			}
		}
		return createToolSimpleTextResult(lines.join('\n') || 'No SCM changes.');
	}
}

interface IQuantumIDEToolWithData extends IToolImpl { getToolData(): IToolData; }

export class QuantumIDEChatWorkflowToolsContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.quantumideChatWorkflowTools';

	constructor(
		@ILanguageModelToolsService toolsService: ILanguageModelToolsService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		for (const T of [QuantumIDERunReplTool, QuantumIDEExpandContextTool, QuantumIDECodeReviewTool, QuantumIDEScaffoldPreviewTool, QuantumIDEFrameworkWorkflowTool, QuantumIDEGitStatusTool] as const) {
			const tool = instantiationService.createInstance(T) as IQuantumIDEToolWithData;
			this._store.add(toolsService.registerTool(tool.getToolData(), tool));
		}
	}
}
