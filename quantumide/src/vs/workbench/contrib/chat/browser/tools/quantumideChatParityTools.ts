/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { ICodeEditorService } from '../../../../../editor/browser/services/codeEditorService.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { localize } from '../../../../../nls.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IQuantumIDECommandAuditService } from '../../../../services/quantumide/browser/quantumideCommandAuditService.js';
import { isQuantumIDEInstantSafeCommand } from '../../../../../platform/quantumide/common/quantumideAgentInstantCommands.js';
import { wrapQuantumIDECommandExecution } from './quantumideCursorLevelTools.js';
import { IQuantumIDEFileExplorerTreeService } from '../../../../services/quantumide/common/quantumideFileExplorerTree.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { QuantumIDEAISettingId } from '../../../../../platform/quantumide/common/quantumideAISettings.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { IQuantumIDEActiveEditorService } from '../../../../services/quantumide/browser/quantumideActiveEditorService.js';
import { IQuantumIDECollaborationService } from '../../../../services/quantumide/common/quantumideCollaboration.js';
import { IQuantumIDEAgentTaskOrchestratorService } from '../../../../services/quantumide/common/quantumideAgentTask.js';
import { IQuantumIDEEditorStateService } from '../../../../services/quantumide/browser/quantumideEditorStateService.js';
import { IQuantumIDELivePreviewService } from '../../../../services/quantumide/browser/quantumideLivePreviewService.js';
import { IQuantumIDEMergeConflictService } from '../../../../services/quantumide/browser/quantumideMergeConflictService.js';
import { IQuantumIDEInlineDiffService } from '../../../../services/quantumide/browser/quantumideInlineDiffService.js';
import { IQuantumIDEInlineEditorService } from '../../../../services/quantumide/browser/quantumideInlineEditorService.js';
import { IQuantumIDEEditorManipulationService } from '../../../../services/quantumide/common/quantumideEditorManipulation.js';
import { IQuantumIDEOpenBuffersService } from '../../../../services/quantumide/common/quantumideOpenBuffers.js';
import { IQuantumIDEUnsavedBufferService } from '../../../../services/quantumide/common/quantumideUnsavedBuffer.js';
import { IQuantumIDEWorkspaceRenameService } from '../../../../services/quantumide/browser/quantumideWorkspaceRenameService.js';
import { IQuantumIDEPluginBridgeService } from '../../../../services/quantumide/browser/quantumidePluginBridgeService.js';
import { IQuantumIDEIdeIntegrationService } from '../../../../services/quantumide/common/quantumideIdeIntegration.js';
import { IQuantumIDETerminalBlockService } from '../../../../services/quantumide/common/quantumideTerminalBlock.js';
import { CountTokensCallback, ILanguageModelToolsService, IPreparedToolInvocation, IToolData, IToolImpl, IToolInvocation, IToolInvocationPreparationContext, IToolResult, ToolDataSource, ToolProgress } from '../../common/tools/languageModelToolsService.js';
import { createToolSimpleTextResult } from '../../common/tools/builtinTools/toolHelpers.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';

const QUANTUMIDE_TOOL_WHEN = ContextKeyExpr.equals(`config.${QuantumIDEAISettingId.ChatCursorParityEnabled}`, true);

export const QuantumIDEEditActiveEditorToolId = 'quantumide_edit_active_editor';
export const QuantumIDEGetEditorStateToolId = 'quantumide_get_editor_state';
export const QuantumIDEExecuteCommandToolId = 'quantumide_execute_workbench_command';
export const QuantumIDERunCodePreviewToolId = 'quantumide_run_code_preview';
export const QuantumIDEOpenVisualDiffToolId = 'quantumide_open_visual_diff';
export const QuantumIDEMergeConflictToolId = 'quantumide_merge_conflict';
export const QuantumIDECollabSyncToolId = 'quantumide_collab_sync';
export const QuantumIDEAgentTaskToolId = 'quantumide_agent_task';
export const QuantumIDEInlineSuggestionToolId = 'quantumide_show_inline_suggestion';
export const QuantumIDEMoveWorkspaceFilesToolId = 'quantumide_move_workspace_files';
export const QuantumIDEManipulateEditorToolId = 'quantumide_manipulate_editor';
export const QuantumIDEGetOpenBuffersToolId = 'quantumide_get_open_buffers';
export const QuantumIDELspWorkspaceRenameToolId = 'quantumide_lsp_workspace_rename';
export const QuantumIDEReadUnsavedBufferToolId = 'quantumide_read_unsaved_buffer';
export const QuantumIDEWriteUnsavedBufferToolId = 'quantumide_write_unsaved_buffer';
export const QuantumIDEInvokePluginToolId = 'quantumide_invoke_plugin';
export const QuantumIDERunTerminalCommandToolId = 'quantumide_run_terminal_command';
export const QuantumIDEUpdateSettingToolId = 'quantumide_update_setting';
export const QuantumIDEManageExtensionToolId = 'quantumide_manage_extension';
export const QuantumIDERunLspActionToolId = 'quantumide_run_lsp_action';

function baseToolData(id: string, displayName: string, modelDescription: string, inputSchema: IToolData['inputSchema']): IToolData {
	return {
		id,
		displayName,
		modelDescription,
		userDescription: displayName,
		source: ToolDataSource.Internal,
		when: QUANTUMIDE_TOOL_WHEN,
		icon: ThemeIcon.fromId(Codicon.sparkle.id),
		inputSchema,
	};
}

class QuantumIDEEditActiveEditorTool implements IToolImpl {
	constructor(@IQuantumIDEActiveEditorService private readonly _activeEditor: IQuantumIDEActiveEditorService) { }

	getToolData(): IToolData {
		return baseToolData(
			QuantumIDEEditActiveEditorToolId,
			localize('quantumide.tool.editActiveEditor', 'Edit Active Editor'),
			'Insert, replace, or append text directly in the user\'s active editor at the cursor or selection. Use for in-place edits without a full file replace.',
			{
				type: 'object',
				properties: {
					mode: {
						type: 'string',
						enum: ['insert_at_cursor', 'replace_selection', 'insert_after_selection'],
						description: 'How to apply the edit.',
					},
					text: { type: 'string', description: 'Text to insert or use as replacement.' },
				},
				required: ['mode', 'text'],
			},
		);
	}

	async invoke(invocation: IToolInvocation, _count: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		const params = invocation.parameters as { mode?: string; text?: string };
		const result = this._activeEditor.editActiveEditor({
			mode: (params.mode ?? 'insert_at_cursor') as 'insert_at_cursor' | 'replace_selection' | 'insert_after_selection',
			text: String(params.text ?? ''),
		});
		return createToolSimpleTextResult(JSON.stringify(result, undefined, 2));
	}
}

class QuantumIDEGetEditorStateTool implements IToolImpl {
	constructor(@IQuantumIDEEditorStateService private readonly _editorState: IQuantumIDEEditorStateService) { }

	getToolData(): IToolData {
		return baseToolData(
			QuantumIDEGetEditorStateToolId,
			localize('quantumide.tool.getEditorState', 'Get Editor State'),
			'Returns the active file, cursor, selection, visible range, and open tabs for context-aware responses.',
			{ type: 'object', properties: {}, additionalProperties: false },
		);
	}

	async invoke(_invocation: IToolInvocation, _count: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		const body = this._editorState.formatEditorStateForContext() ?? 'No active editor.';
		return createToolSimpleTextResult(body);
	}
}

class QuantumIDEGetOpenBuffersTool implements IToolImpl {
	constructor(
		@IQuantumIDEOpenBuffersService private readonly _buffers: IQuantumIDEOpenBuffersService,
		@IQuantumIDEEditorStateService private readonly _editorState: IQuantumIDEEditorStateService,
	) { }

	getToolData(): IToolData {
		return baseToolData(
			QuantumIDEGetOpenBuffersToolId,
			localize('quantumide.tool.openBuffers', 'Get Open Buffers'),
			'Returns all open editor tabs with order, dirty/untitled flags, and content previews (including unsaved changes).',
			{ type: 'object', properties: { maxPreviewChars: { type: 'number' } } },
		);
	}

	async invoke(invocation: IToolInvocation, _count: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		const max = Number((invocation.parameters as { maxPreviewChars?: number }).maxPreviewChars ?? 3000);
		const editor = this._editorState.formatEditorStateForContext() ?? '';
		const buffers = this._buffers.formatForContext(max);
		return createToolSimpleTextResult([editor, buffers].filter(Boolean).join('\n\n'));
	}
}

class QuantumIDEManipulateEditorTool implements IToolImpl {
	constructor(@IQuantumIDEEditorManipulationService private readonly _manipulation: IQuantumIDEEditorManipulationService) { }

	getToolData(): IToolData {
		return baseToolData(
			QuantumIDEManipulateEditorToolId,
			localize('quantumide.tool.manipulateEditor', 'Manipulate Editor'),
			'Move cursor, set selection(s), reveal lines, open files at positions, or add cursors in real time.',
			{
				type: 'object',
				properties: {
					action: { type: 'string', enum: ['set_cursor', 'set_selection', 'set_selections', 'reveal_line', 'reveal_line_center', 'open_file', 'add_cursor', 'highlight_range', 'close_editor'] },
					resource: { type: 'string' },
					line: { type: 'number' },
					column: { type: 'number' },
					endLine: { type: 'number' },
					endColumn: { type: 'number' },
					selections: { type: 'array', items: { type: 'object' } },
				},
				required: ['action'],
			},
		);
	}

	async invoke(invocation: IToolInvocation, _count: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		const p = invocation.parameters as Record<string, unknown>;
		const result = await this._manipulation.manipulate({
			action: String(p.action ?? 'set_cursor') as import('../../../../services/quantumide/common/quantumideEditorManipulation.js').QuantumIDEEditorManipulationAction,
			resource: typeof p.resource === 'string' ? p.resource : undefined,
			line: typeof p.line === 'number' ? p.line : undefined,
			column: typeof p.column === 'number' ? p.column : undefined,
			endLine: typeof p.endLine === 'number' ? p.endLine : undefined,
			endColumn: typeof p.endColumn === 'number' ? p.endColumn : undefined,
			selections: Array.isArray(p.selections) ? p.selections as { startLine: number; startColumn: number; endLine: number; endColumn: number }[] : undefined,
		});
		return createToolSimpleTextResult(JSON.stringify(result, undefined, 2));
	}
}

class QuantumIDELspWorkspaceRenameTool implements IToolImpl {
	constructor(@IQuantumIDEWorkspaceRenameService private readonly _rename: IQuantumIDEWorkspaceRenameService) { }

	getToolData(): IToolData {
		return baseToolData(
			QuantumIDELspWorkspaceRenameToolId,
			localize('quantumide.tool.lspRename', 'LSP Workspace Rename'),
			'Workspace-wide LSP rename with preview, staged edits, and checkpoint for undo.',
			{
				type: 'object',
				properties: {
					symbol: { type: 'string' },
					newName: { type: 'string' },
					filePath: { type: 'string' },
					uri: { type: 'string' },
					lineContent: { type: 'string' },
					previewOnly: { type: 'boolean', description: 'When true (default), stage edits for review. Set false or use apply:true to apply immediately.' },
					apply: { type: 'boolean', description: 'When true, apply rename across workspace (creates checkpoint).' },
				},
				required: ['symbol', 'newName', 'lineContent'],
			},
		);
	}

	async invoke(invocation: IToolInvocation, _count: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		const p = invocation.parameters as Record<string, unknown>;
		const result = await this._rename.renameSymbol({
			symbol: String(p.symbol ?? ''),
			newName: String(p.newName ?? ''),
			filePath: typeof p.filePath === 'string' ? p.filePath : undefined,
			uri: typeof p.uri === 'string' ? p.uri : undefined,
			lineContent: String(p.lineContent ?? ''),
			previewOnly: p.apply === true ? false : p.previewOnly !== false,
		}, invocation.context?.workingDirectory);
		return createToolSimpleTextResult(JSON.stringify(result, undefined, 2));
	}
}

class QuantumIDEReadUnsavedBufferTool implements IToolImpl {
	constructor(@IQuantumIDEUnsavedBufferService private readonly _buffers: IQuantumIDEUnsavedBufferService) { }

	getToolData(): IToolData {
		return baseToolData(
			QuantumIDEReadUnsavedBufferToolId,
			localize('quantumide.tool.readUnsaved', 'Read Unsaved Buffer'),
			'Read current editor buffer content including unsaved changes.',
			{ type: 'object', properties: { resource: { type: 'string' } }, required: ['resource'] },
		);
	}

	async invoke(invocation: IToolInvocation, _count: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		const resource = String((invocation.parameters as { resource?: string }).resource ?? '');
		const read = await this._buffers.readBuffer(resource);
		return createToolSimpleTextResult(read ? JSON.stringify(read, undefined, 2) : 'Buffer not found.');
	}
}

class QuantumIDEWriteUnsavedBufferTool implements IToolImpl {
	constructor(@IQuantumIDEUnsavedBufferService private readonly _buffers: IQuantumIDEUnsavedBufferService) { }

	getToolData(): IToolData {
		return baseToolData(
			QuantumIDEWriteUnsavedBufferToolId,
			localize('quantumide.tool.writeUnsaved', 'Write Unsaved Buffer'),
			'Replace or patch unsaved editor buffer content with undo support.',
			{
				type: 'object',
				properties: {
					resource: { type: 'string' },
					content: { type: 'string' },
					startLine: { type: 'number' },
					startColumn: { type: 'number' },
					endLine: { type: 'number' },
					endColumn: { type: 'number' },
				},
				required: ['resource'],
			},
		);
	}

	async invoke(invocation: IToolInvocation, _count: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		const p = invocation.parameters as Record<string, unknown>;
		const resource = String(p.resource ?? '');
		if (typeof p.content === 'string' && !p.startLine) {
			const result = await this._buffers.writeBuffer(resource, p.content);
			return createToolSimpleTextResult(JSON.stringify(result, undefined, 2));
		}
		const result = await this._buffers.applyPartialEdit(
			resource,
			Number(p.startLine ?? 1),
			Number(p.startColumn ?? 1),
			Number(p.endLine ?? 1),
			Number(p.endColumn ?? 1),
			String(p.content ?? ''),
		);
		return createToolSimpleTextResult(JSON.stringify(result, undefined, 2));
	}
}

class QuantumIDEInvokePluginTool implements IToolImpl {
	constructor(@IQuantumIDEPluginBridgeService private readonly _plugins: IQuantumIDEPluginBridgeService) { }

	getToolData(): IToolData {
		return baseToolData(
			QuantumIDEInvokePluginToolId,
			localize('quantumide.tool.invokePlugin', 'Invoke Plugin'),
			'Invoke a registered QuantumIDE plugin client or host tool by id.',
			{
				type: 'object',
				properties: {
					toolId: { type: 'string' },
					args: { type: 'object' },
				},
				required: ['toolId'],
			},
		);
	}

	async invoke(invocation: IToolInvocation, _count: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		const p = invocation.parameters as { toolId?: string; args?: Record<string, unknown> };
		const result = await this._plugins.invoke({ toolId: String(p.toolId ?? ''), args: p.args });
		return createToolSimpleTextResult(JSON.stringify(result, undefined, 2));
	}
}

class QuantumIDERunTerminalCommandTool implements IToolImpl {
	constructor(
		@IQuantumIDELivePreviewService private readonly _preview: IQuantumIDELivePreviewService,
		@IQuantumIDETerminalBlockService private readonly _terminalBlocks: IQuantumIDETerminalBlockService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) { }

	getToolData(): IToolData {
		return baseToolData(
			QuantumIDERunTerminalCommandToolId,
			localize('quantumide.tool.runTerminal', 'Run Terminal Command'),
			'Execute a shell command in the integrated terminal and return output in chat.',
			{
				type: 'object',
				properties: {
					command: { type: 'string' },
					language: { type: 'string' },
				},
				required: ['command'],
			},
		);
	}

	async prepareToolInvocation(context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const command = String((context.parameters as { command?: string }).command ?? '');
		const requireConfirm = this._configurationService.getValue<boolean>(QuantumIDEAISettingId.AgentRequireConfirmationForTerminal) !== false;
		const autoApprove = this._configurationService.getValue<boolean>(QuantumIDEAISettingId.TerminalAutoApproveSafe) === true
			&& !requireConfirm;
		if (autoApprove) {
			return {
				invocationMessage: localize('quantumide.tool.terminal.invocation', 'Running terminal command'),
				confirmationMessages: {
					title: localize('quantumide.tool.terminal.confirm', 'Run command'),
					message: new MarkdownString(localize('quantumide.tool.terminal.auto', 'Safe terminal command (auto-approved): `{0}`', command)),
					allowAutoConfirm: true,
					confirmationNotNeededReason: 'quantumide-auto-terminal',
				},
			};
		}
		return {
			invocationMessage: localize('quantumide.tool.terminal.invocation', 'Running terminal command'),
			confirmationMessages: {
				title: localize('quantumide.tool.terminal.confirm', 'Run command'),
				message: new MarkdownString(localize('quantumide.tool.terminal.approve', 'Approve running in integrated terminal:\n\n```\n{0}\n```', command)),
				allowAutoConfirm: false,
			},
		};
	}

	async invoke(invocation: IToolInvocation, _count: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		const p = invocation.parameters as { command?: string; language?: string };
		const command = String(p.command ?? '');
		const result = await this._preview.runSnippetPreview(p.language ?? 'shell', command);
		this._terminalBlocks.recordTerminalRun(command, result.success ? 0 : 1, result.output);
		return createToolSimpleTextResult(JSON.stringify(result, undefined, 2));
	}
}

class QuantumIDEExecuteCommandTool implements IToolImpl {
	constructor(
		@ICommandService private readonly _commandService: ICommandService,
		@IQuantumIDECommandAuditService private readonly _audit: IQuantumIDECommandAuditService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) { }

	getToolData(): IToolData {
		return baseToolData(
			QuantumIDEExecuteCommandToolId,
			localize('quantumide.tool.executeCommand', 'Execute Workbench Command'),
			'Runs a VS Code / QuantumIDE command palette command by id (e.g. editor.action.formatDocument). Pass JSON args when needed.',
			{
				type: 'object',
				properties: {
					commandId: { type: 'string', description: 'Command id from the command palette.' },
					args: { type: 'object', description: 'Optional command arguments object.' },
				},
				required: ['commandId'],
			},
		);
	}

	async prepareToolInvocation(context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const commandId = String((context.parameters as { commandId?: string }).commandId ?? '');
		const instant = isQuantumIDEInstantSafeCommand(
			commandId,
			this._configurationService.getValue<boolean>(QuantumIDEAISettingId.AgentInstantPaletteCommands) === true,
		);
		return {
			invocationMessage: localize('quantumide.tool.executeCommand.invocation', 'Running command `{0}`', commandId),
			pastTenseMessage: localize('quantumide.tool.executeCommand.past', 'Ran command `{0}`', commandId),
			confirmationMessages: instant ? {
				title: localize('quantumide.tool.executeCommand.confirmTitle', 'Run command'),
				message: new MarkdownString(localize('quantumide.tool.executeCommand.instant', 'Instant-safe command `{0}` (auto-approved).', commandId)),
				allowAutoConfirm: true,
				confirmationNotNeededReason: 'quantumide-instant-palette',
			} : undefined,
		};
	}

	async invoke(invocation: IToolInvocation, _count: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		const params = invocation.parameters as { commandId?: string; args?: unknown };
		const commandId = String(params.commandId ?? '').trim();
		if (!commandId) {
			return createToolSimpleTextResult('commandId is required.');
		}
		try {
			const result = await wrapQuantumIDECommandExecution(
				this._commandService,
				this._audit,
				this._configurationService,
				commandId,
				params.args,
				'quantumide_execute_workbench_command',
			);
			const log = this._audit.getSessionLog(5).map(e => `${e.success ? '✓' : '✗'} ${e.commandId}`).join('\n');
			const base = typeof result === 'undefined' ? `Executed ${commandId}.` : JSON.stringify(result);
			return createToolSimpleTextResult(`${base}\n\nRecent commands:\n${log}`);
		} catch (err) {
			return createToolSimpleTextResult(`Command failed: ${err instanceof Error ? err.message : String(err)}`);
		}
	}
}

class QuantumIDERunCodePreviewTool implements IToolImpl {
	constructor(@IQuantumIDELivePreviewService private readonly _livePreview: IQuantumIDELivePreviewService) { }

	getToolData(): IToolData {
		return baseToolData(
			QuantumIDERunCodePreviewToolId,
			localize('quantumide.tool.runCodePreview', 'Run Code Preview'),
			'Executes a short code snippet in the integrated terminal and returns captured output for live preview in chat.',
			{
				type: 'object',
				properties: {
					code: { type: 'string', description: 'Source code to run.' },
					language: { type: 'string', description: 'Language hint: shell, python, javascript, etc.' },
				},
				required: ['code'],
			},
		);
	}

	async invoke(invocation: IToolInvocation, _count: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		const params = invocation.parameters as { code?: string; language?: string };
		const result = await this._livePreview.runSnippetPreview(params.language, String(params.code ?? ''));
		const text = `Command: ${result.command}\n\nOutput:\n${result.output}`;
		const toolResult = createToolSimpleTextResult(text);
		toolResult.toolResultMessage = new MarkdownString(`\`\`\`\n${result.output.slice(0, 2000)}\n\`\`\``);
		return toolResult;
	}
}

class QuantumIDEOpenVisualDiffTool implements IToolImpl {
	constructor(
		@IQuantumIDEMergeConflictService private readonly _merge: IQuantumIDEMergeConflictService,
		@IWorkspaceContextService private readonly _workspace: IWorkspaceContextService,
	) { }

	getToolData(): IToolData {
		return baseToolData(
			QuantumIDEOpenVisualDiffToolId,
			localize('quantumide.tool.openVisualDiff', 'Open Visual Diff'),
			'Opens the multi-file diff review UI for a proposed file change before applying.',
			{
				type: 'object',
				properties: {
					path: { type: 'string', description: 'Workspace-relative file path.' },
					proposedContent: { type: 'string', description: 'Full proposed file content.' },
				},
				required: ['path', 'proposedContent'],
			},
		);
	}

	async invoke(invocation: IToolInvocation, _count: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		const params = invocation.parameters as { path?: string; proposedContent?: string };
		const root = this._workspace.getWorkspace().folders[0]?.uri;
		await this._merge.openVisualDiffForPath(String(params.path ?? ''), String(params.proposedContent ?? ''), root);
		return createToolSimpleTextResult(`Opened visual diff review for ${params.path}.`);
	}
}

class QuantumIDEMergeConflictTool implements IToolImpl {
	constructor(@IQuantumIDEMergeConflictService private readonly _merge: IQuantumIDEMergeConflictService) { }

	getToolData(): IToolData {
		return baseToolData(
			QuantumIDEMergeConflictToolId,
			localize('quantumide.tool.mergeConflict', 'Merge Conflict'),
			'Navigate or resolve git merge conflicts in the active or specified file using the merge editor.',
			{
				type: 'object',
				properties: {
					action: {
						type: 'string',
						enum: ['open_merge_editor', 'accept_current', 'accept_incoming', 'next_conflict'],
					},
					uri: { type: 'string', description: 'Optional file URI; defaults to active editor.' },
				},
				required: ['action'],
			},
		);
	}

	async invoke(invocation: IToolInvocation, _count: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		const params = invocation.parameters as { action?: string; uri?: string };
		const uri = params.uri ? URI.parse(params.uri) : undefined;
		const result = await this._merge.resolveConflictAction(
			(params.action ?? 'next_conflict') as 'open_merge_editor' | 'accept_current' | 'accept_incoming' | 'next_conflict',
			uri,
		);
		return createToolSimpleTextResult(JSON.stringify(result));
	}
}

class QuantumIDECollabSyncTool implements IToolImpl {
	constructor(@IQuantumIDECollaborationService private readonly _collab: IQuantumIDECollaborationService) { }

	getToolData(): IToolData {
		return baseToolData(
			QuantumIDECollabSyncToolId,
			localize('quantumide.tool.collabSync', 'Collaboration Sync'),
			'Start, join, refresh, or append messages to a shared QuantumIDE collaboration session stored in the workspace.',
			{
				type: 'object',
				properties: {
					operation: { type: 'string', enum: ['start', 'join', 'refresh', 'message', 'sync', 'status', 'resolve'] },
					strategy: { type: 'string', enum: ['local', 'remote', 'merge'] },
					sessionId: { type: 'string' },
					displayName: { type: 'string' },
					message: { type: 'string' },
				},
				required: ['operation'],
			},
		);
	}

	async invoke(invocation: IToolInvocation, _count: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		const params = invocation.parameters as {
			operation?: string;
			sessionId?: string;
			displayName?: string;
			message?: string;
		};
		switch (params.operation) {
			case 'start': {
				const session = await this._collab.startSession(String(params.displayName ?? 'Agent'));
				return createToolSimpleTextResult(JSON.stringify(session));
			}
			case 'join': {
				const session = await this._collab.joinSession(String(params.sessionId ?? ''), String(params.displayName ?? 'Agent'));
				return createToolSimpleTextResult(session ? JSON.stringify(session) : 'Session not found.');
			}
			case 'refresh': {
				const session = await this._collab.refreshSession();
				return createToolSimpleTextResult(session ? JSON.stringify(session) : 'No active session.');
			}
			case 'message': {
				const msg = await this._collab.appendChatMessage(String(params.message ?? ''), String(params.displayName ?? 'Agent'));
				return createToolSimpleTextResult(msg ? JSON.stringify(msg) : 'No active collaboration session.');
			}
			case 'sync': {
				await this._collab.forceSync();
				return createToolSimpleTextResult(JSON.stringify(this._collab.getSyncState()));
			}
			case 'status': {
				return createToolSimpleTextResult(JSON.stringify({
					sync: this._collab.getSyncState(),
					session: this._collab.getActiveSession(),
				}));
			}
			case 'resolve': {
				const ok = await this._collab.resolveConflict((params as { strategy?: string }).strategy as 'local' | 'remote' | 'merge' ?? 'merge');
				return createToolSimpleTextResult(ok ? 'Conflict resolved.' : 'No conflict to resolve.');
			}
			default:
				return createToolSimpleTextResult('Unknown operation. Use start, join, refresh, or message.');
		}
	}
}

class QuantumIDEAgentTaskTool implements IToolImpl {
	constructor(@IQuantumIDEAgentTaskOrchestratorService private readonly _tasks: IQuantumIDEAgentTaskOrchestratorService) { }

	getToolData(): IToolData {
		return baseToolData(
			QuantumIDEAgentTaskToolId,
			localize('quantumide.tool.agentTask', 'Agent Task Orchestrator'),
			'Plan and report multi-step agent work with checkpoints, pause, and rollback.',
			{
				type: 'object',
				properties: {
					operation: { type: 'string', enum: ['begin', 'plan', 'add_step', 'start', 'complete', 'fail', 'pause', 'resume', 'abort', 'status'] },
					title: { type: 'string' },
					planSummary: { type: 'string' },
					planSteps: { type: 'array', items: { type: 'string' } },
					stepId: { type: 'string' },
					label: { type: 'string' },
					error: { type: 'string' },
				},
				required: ['operation'],
			},
		);
	}

	async invoke(invocation: IToolInvocation, _count: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		const params = invocation.parameters as {
			operation?: string;
			title?: string;
			planSummary?: string;
			planSteps?: string[];
			stepId?: string;
			label?: string;
			error?: string;
		};
		switch (params.operation) {
			case 'begin':
				this._tasks.beginTask(
					String(params.title ?? 'Agent task'),
					params.planSteps,
					params.planSummary,
				);
				return createToolSimpleTextResult(JSON.stringify(this._tasks.getState()));
			case 'plan':
				if (params.planSummary) {
					this._tasks.setPlanSummary(params.planSummary);
				}
				return createToolSimpleTextResult(JSON.stringify(this._tasks.getState()));
			case 'add_step': {
				const id = this._tasks.addStep(String(params.label ?? 'Step'));
				return createToolSimpleTextResult(id);
			}
			case 'start':
				await this._tasks.startStep(String(params.stepId ?? ''));
				return createToolSimpleTextResult(JSON.stringify(this._tasks.getState()));
			case 'complete':
				await this._tasks.completeStep(String(params.stepId ?? ''));
				return createToolSimpleTextResult(JSON.stringify(this._tasks.getState()));
			case 'fail':
				await this._tasks.failStep(String(params.stepId ?? ''), String(params.error ?? 'failed'));
				return createToolSimpleTextResult(JSON.stringify(this._tasks.getState()));
			case 'pause':
				this._tasks.pause();
				return createToolSimpleTextResult('paused');
			case 'resume':
				this._tasks.resume();
				return createToolSimpleTextResult('resumed');
			case 'abort':
				await this._tasks.abort();
				return createToolSimpleTextResult('aborted');
			case 'status':
			default:
				return createToolSimpleTextResult(JSON.stringify(this._tasks.getState()));
		}
	}
}

class QuantumIDEMoveWorkspaceFilesTool implements IToolImpl {
	constructor(
		@IQuantumIDEFileExplorerTreeService private readonly _fileTree: IQuantumIDEFileExplorerTreeService,
		@IWorkspaceContextService private readonly _workspace: IWorkspaceContextService,
	) { }

	getToolData(): IToolData {
		return baseToolData(
			QuantumIDEMoveWorkspaceFilesToolId,
			localize('quantumide.tool.moveFiles', 'Move Workspace Files'),
			'Moves files or folders into a target directory (drag-and-drop parity for agent-driven file operations).',
			{
				type: 'object',
				properties: {
					sourcePaths: {
						type: 'array',
						items: { type: 'string' },
						description: 'Workspace-relative paths to move.',
					},
					targetDirectory: { type: 'string', description: 'Workspace-relative target directory path.' },
				},
				required: ['sourcePaths', 'targetDirectory'],
			},
		);
	}

	async invoke(invocation: IToolInvocation, _count: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		const params = invocation.parameters as { sourcePaths?: string[]; targetDirectory?: string };
		const root = this._workspace.getWorkspace().folders[0]?.uri;
		if (!root) {
			return createToolSimpleTextResult('No workspace folder open.');
		}
		const targetDir = String(params.targetDirectory ?? '').trim();
		const sources = (params.sourcePaths ?? []).map(p => String(p).trim()).filter(Boolean);
		if (!targetDir || sources.length === 0) {
			return createToolSimpleTextResult('sourcePaths and targetDirectory are required.');
		}
		const targetUri = URI.joinPath(root, targetDir.replace(/^\.\//, '').replace(/\\/g, '/'));
		const sourceUris = sources.map(p => URI.joinPath(root, p.replace(/^\.\//, '').replace(/\\/g, '/')));
		const result = await this._fileTree.moveEntries(sourceUris, targetUri);
		await this._fileTree.refresh();
		return createToolSimpleTextResult(JSON.stringify(result, undefined, 2));
	}
}

class QuantumIDEInlineSuggestionTool implements IToolImpl {
	constructor(
		@ICodeEditorService private readonly _codeEditorService: ICodeEditorService,
		@IQuantumIDEInlineEditorService private readonly _inlineEditor: IQuantumIDEInlineEditorService,
		@IQuantumIDEInlineDiffService private readonly _inlineDiff: IQuantumIDEInlineDiffService,
	) { }

	getToolData(): IToolData {
		return baseToolData(
			QuantumIDEInlineSuggestionToolId,
			localize('quantumide.tool.inlineSuggestion', 'Show Inline Suggestion'),
			'Shows an inline diff in the editor for the current selection so the user can accept or reject the change in context.',
			{
				type: 'object',
				properties: {
					replacement: { type: 'string', description: 'Proposed replacement for the selection.' },
					instruction: { type: 'string', description: 'Alternatively, an AI instruction to generate replacement (uses inline model).' },
				},
			},
		);
	}

	async invoke(invocation: IToolInvocation, _count: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		const params = invocation.parameters as { replacement?: string; instruction?: string };
		const ctx = this._inlineEditor.getActiveSelectionContext();
		if (!ctx) {
			return createToolSimpleTextResult('No active editor selection for inline suggestion.');
		}
		if (params.instruction?.trim()) {
			this._inlineEditor.runInlinePrompt(params.instruction, { codeOnly: true });
			return createToolSimpleTextResult('Started inline AI generation; user can accept/reject in the editor.');
		}
		const editor = this._codeEditorService.getActiveCodeEditor() ?? this._codeEditorService.getFocusedCodeEditor();
		const model = editor?.getModel();
		const selection = editor?.getSelection();
		if (!editor || !model || !selection || selection.isEmpty()) {
			return createToolSimpleTextResult('No selection for inline suggestion.');
		}
		const uri = model.uri;
		const range = new Range(selection.startLineNumber, selection.startColumn, selection.endLineNumber, selection.endColumn);
		const replacement = String(params.replacement ?? '');
		if (!replacement) {
			return createToolSimpleTextResult('Provide replacement or instruction.');
		}
		this._inlineDiff.showProposal(uri, range, ctx.selectedText, replacement);
		return createToolSimpleTextResult('Inline suggestion shown; user can accept or reject with QuantumIDE inline diff commands.');
	}
}

class QuantumIDEUpdateSettingTool implements IToolImpl {
	constructor(@IQuantumIDEIdeIntegrationService private readonly _ide: IQuantumIDEIdeIntegrationService) { }

	getToolData(): IToolData {
		return baseToolData(
			QuantumIDEUpdateSettingToolId,
			localize('quantumide.tool.updateSetting', 'Update Setting'),
			'Update a QuantumIDE or editor setting (quantumide.*, editor.*, chat.* keys only).',
			{
				type: 'object',
				properties: {
					key: { type: 'string' },
					value: {},
					scope: { type: 'string', enum: ['user', 'workspace'] },
				},
				required: ['key', 'value'],
			},
		);
	}

	async invoke(invocation: IToolInvocation, _c: CountTokensCallback, _p: ToolProgress, _t: CancellationToken): Promise<IToolResult> {
		const p = invocation.parameters as { key?: string; value?: unknown; scope?: 'user' | 'workspace' };
		const result = await this._ide.updateSetting(String(p.key ?? ''), p.value, p.scope);
		return createToolSimpleTextResult(JSON.stringify(result));
	}
}

class QuantumIDEManageExtensionTool implements IToolImpl {
	constructor(@IQuantumIDEIdeIntegrationService private readonly _ide: IQuantumIDEIdeIntegrationService) { }

	getToolData(): IToolData {
		return baseToolData(
			QuantumIDEManageExtensionToolId,
			localize('quantumide.tool.manageExtension', 'Manage Extension'),
			'List, install, enable, or disable VS Code extensions from chat. Reports reload requirement when needed.',
			{
				type: 'object',
				properties: {
					operation: { type: 'string', enum: ['list', 'install', 'enable', 'disable'] },
					extensionId: { type: 'string' },
					query: { type: 'string' },
					enableAfterInstall: { type: 'boolean' },
				},
				required: ['operation'],
			},
		);
	}

	async invoke(invocation: IToolInvocation, _c: CountTokensCallback, _p: ToolProgress, _t: CancellationToken): Promise<IToolResult> {
		const p = invocation.parameters as { operation?: string; extensionId?: string; query?: string; enableAfterInstall?: boolean };
		if (p.operation === 'list') {
			const list = await this._ide.listExtensions(p.query);
			return createToolSimpleTextResult(JSON.stringify(list, undefined, 2));
		}
		if (p.operation === 'install') {
			const result = await this._ide.installExtension(String(p.extensionId ?? ''), p.enableAfterInstall !== false);
			return createToolSimpleTextResult(JSON.stringify(result));
		}
		const result = await this._ide.setExtensionEnabled(String(p.extensionId ?? ''), p.operation === 'enable');
		return createToolSimpleTextResult(JSON.stringify(result));
	}
}

class QuantumIDERunLspActionTool implements IToolImpl {
	constructor(@IQuantumIDEIdeIntegrationService private readonly _ide: IQuantumIDEIdeIntegrationService) { }

	getToolData(): IToolData {
		return baseToolData(
			QuantumIDERunLspActionToolId,
			localize('quantumide.tool.lspAction', 'Run LSP Action'),
			'Trigger LSP/editor actions: rename, format, organizeImports, quickFix, refactor.',
			{
				type: 'object',
				properties: {
					action: { type: 'string', enum: ['rename', 'format', 'organizeImports', 'quickFix', 'refactor'] },
				},
				required: ['action'],
			},
		);
	}

	async invoke(invocation: IToolInvocation, _c: CountTokensCallback, _p: ToolProgress, _t: CancellationToken): Promise<IToolResult> {
		const action = String((invocation.parameters as { action?: string }).action ?? 'format') as 'rename' | 'format' | 'organizeImports' | 'quickFix' | 'refactor';
		const result = await this._ide.runLspAction(action);
		return createToolSimpleTextResult(JSON.stringify(result));
	}
}

interface IQuantumIDEToolWithData extends IToolImpl {
	getToolData(): IToolData;
}

export class QuantumIDEChatParityToolsContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.quantumideChatParityTools';

	constructor(
		@ILanguageModelToolsService toolsService: ILanguageModelToolsService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		const toolTypes = [
			QuantumIDEEditActiveEditorTool,
			QuantumIDEGetEditorStateTool,
			QuantumIDEExecuteCommandTool,
			QuantumIDERunCodePreviewTool,
			QuantumIDEOpenVisualDiffTool,
			QuantumIDEMergeConflictTool,
			QuantumIDECollabSyncTool,
			QuantumIDEAgentTaskTool,
			QuantumIDEInlineSuggestionTool,
			QuantumIDEMoveWorkspaceFilesTool,
			QuantumIDEGetOpenBuffersTool,
			QuantumIDEManipulateEditorTool,
			QuantumIDELspWorkspaceRenameTool,
			QuantumIDEReadUnsavedBufferTool,
			QuantumIDEWriteUnsavedBufferTool,
			QuantumIDEInvokePluginTool,
			QuantumIDERunTerminalCommandTool,
			QuantumIDEUpdateSettingTool,
			QuantumIDEManageExtensionTool,
			QuantumIDERunLspActionTool,
		] as const;
		for (const ToolType of toolTypes) {
			const tool = instantiationService.createInstance(ToolType) as IQuantumIDEToolWithData;
			this._store.add(toolsService.registerTool(tool.getToolData(), tool));
		}
	}
}
