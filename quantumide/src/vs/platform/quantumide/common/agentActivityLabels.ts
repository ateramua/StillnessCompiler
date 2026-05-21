/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { sanitizeActivityDetailText } from './agentActivityProgress.js';

export type AgentActivityKind = 'search' | 'read' | 'edit' | 'terminal' | 'tool' | 'reasoning' | 'plan' | 'subagent' | 'status' | 'error';
export type AgentActivityVerbosity = 'minimal' | 'normal' | 'verbose';
export type AgentActivityPhase = 'running' | 'completed' | 'failed' | 'cancelled';

export interface IAgentActivityLabel {
	readonly kind: AgentActivityKind;
	/** Completed-state label (backward compatible). */
	readonly label: string;
	readonly runningLabel: string;
	readonly completedLabel: string;
	readonly failedLabel: string;
	readonly detail?: string;
}

export function getAgentActivityLabel(toolName: string, args: Record<string, unknown> = {}, verbosity: AgentActivityVerbosity = 'normal'): IAgentActivityLabel {
	const kind = getAgentActivityKind(toolName);
	const runningLabel = buildActivityMessage(kind, toolName, args, verbosity, 'running');
	const completedLabel = buildActivityMessage(kind, toolName, args, verbosity, 'completed');
	const failedLabel = buildActivityMessage(kind, toolName, args, verbosity, 'failed');
	const detail = buildActivityDetail(kind, args, verbosity);
	return { kind, label: completedLabel, runningLabel, completedLabel, failedLabel, detail };
}

export function getAgentActivityMessage(toolName: string, args: Record<string, unknown>, verbosity: AgentActivityVerbosity, phase: AgentActivityPhase): string {
	return buildActivityMessage(getAgentActivityKind(toolName), toolName, args, verbosity, phase);
}

export function getAgentActivityDisplayName(toolName: string, args: Record<string, unknown> = {}): string {
	return getAgentActivityLabel(toolName, args).completedLabel;
}

export function parseAgentActivityToolArguments(toolInput: string | undefined): Record<string, unknown> {
	if (!toolInput) {
		return {};
	}
	try {
		const parsed = JSON.parse(toolInput);
		return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
	} catch {
		return {};
	}
}

export type AgentSessionStatus = 'thinking' | 'working' | 'reasoning';

export function getAgentStatusActivityLabel(status: AgentSessionStatus): string {
	switch (status) {
		case 'thinking':
			return 'Thinking…';
		case 'reasoning':
			return 'Reasoning…';
		case 'working':
			return 'Working…';
	}
}

/** Codicon id for chat tool invocation chrome (see `ThemeIcon.fromId`). */
export function getAgentActivityIconId(kind: AgentActivityKind): string {
	switch (kind) {
		case 'search':
			return 'search';
		case 'read':
			return 'go-to-file';
		case 'edit':
			return 'edit';
		case 'terminal':
			return 'terminal';
		case 'reasoning':
		case 'plan':
			return 'sparkle';
		case 'subagent':
			return 'hubot';
		case 'error':
			return 'error';
		case 'status':
			return 'loading';
		default:
			return 'tools';
	}
}

export function resolveAgentActivityDisplayName(toolName: string, displayName: string | undefined, toolInput: string | undefined, verbosity: AgentActivityVerbosity = 'normal'): string {
	const normalizedDefault = toolName.replace(/_/g, ' ');
	if (displayName && displayName !== toolName && displayName !== normalizedDefault) {
		const mapped = getAgentActivityLabel(toolName, parseAgentActivityToolArguments(toolInput), verbosity);
		if (displayName !== mapped.runningLabel && displayName !== mapped.completedLabel && displayName !== mapped.failedLabel) {
			return displayName;
		}
	}
	return getAgentActivityLabel(toolName, parseAgentActivityToolArguments(toolInput), verbosity).completedLabel;
}

/**
 * Resolves the chat progress line for a tool call (running spinner text vs completed past tense).
 */
export function resolveAgentActivityProgressMessage(
	toolName: string,
	displayName: string | undefined,
	toolInput: string | undefined,
	isComplete: boolean,
	success: boolean | undefined,
	verbosity: AgentActivityVerbosity = 'normal',
): string {
	const args = parseAgentActivityToolArguments(toolInput);
	if (isComplete) {
		if (success === false) {
			return getAgentActivityMessage(toolName, args, verbosity, 'failed');
		}
		return getAgentActivityLabel(toolName, args, verbosity).completedLabel;
	}
	if (displayName && displayName !== toolName && displayName !== toolName.replace(/_/g, ' ')) {
		const mapped = getAgentActivityLabel(toolName, args, verbosity);
		if (displayName === mapped.runningLabel || displayName === mapped.completedLabel) {
			return getAgentActivityMessage(toolName, args, verbosity, 'running');
		}
		return displayName;
	}
	return getAgentActivityMessage(toolName, args, verbosity, 'running');
}

/** Appends match count from host search tool output when present (FR-13). */
export function formatSearchCompletedLabel(completedLabel: string, resultText?: string): string {
	if (!resultText) {
		return completedLabel;
	}
	const match = resultText.match(/Found (\d+) match/);
	if (!match) {
		return completedLabel;
	}
	const suffix = ` (${match[1]} matches)`;
	return completedLabel.includes(suffix) ? completedLabel : `${completedLabel}${suffix}`;
}

export function getAgentActivityKind(toolName: string): AgentActivityKind {
	switch (toolName) {
		case 'search_workspace_text':
		case 'search_workspace_text_batch':
		case 'grep':
		case 'Grep':
		case 'codebase_search':
		case 'codebase-search':
			return 'search';
		case 'read_workspace_file':
		case 'read_file':
		case 'Read':
			return 'read';
		case 'list_workspace_symbols':
		case 'search_semantic_workspace':
		case 'search_vector_workspace':
		case 'search_workspace_comments':
		case 'search_workspace_diagnostics':
		case 'search_external_retrieval':
			return 'search';
		case 'apply_workspace_patch':
		case 'restore_workspace_checkpoint':
		case 'search_workspace_symbols':
		case 'find_symbol_references':
		case 'resolve_import_dependencies':
			return 'tool';
		case 'apply_workspace_edits':
		case 'propose_file_edit':
		case 'write':
		case 'Write':
		case 'edit_file':
		case 'str_replace_editor':
		case 'apply_patch':
			return 'edit';
		case 'run_workspace_check':
		case 'propose_terminal_command':
		case 'bash':
		case 'shell':
		case 'run_terminal_cmd':
		case 'run_terminal_command':
			return 'terminal';
		case 'task':
			return 'subagent';
		case 'quantumide_lsp_workspace_rename':
		case 'rename':
			return 'tool';
		case 'quantumide_run_terminal_command':
		case 'quantumide_execute_workbench_command':
			return 'terminal';
		case 'quantumide_manipulate_editor':
		case 'quantumide_edit_active_editor':
		case 'quantumide_write_unsaved_buffer':
		case 'quantumide_show_inline_suggestion':
			return 'edit';
		case 'quantumide_get_open_buffers':
		case 'quantumide_read_unsaved_buffer':
		case 'quantumide_get_editor_state':
			return 'read';
		case 'quantumide_manage_extension':
		case 'quantumide_invoke_plugin':
		case 'quantumide_update_setting':
		case 'quantumide_run_lsp_action':
		case 'quantumide_collab_sync':
		case 'quantumide_agent_task':
			return 'tool';
		default:
			if (toolName.startsWith('quantumide_')) {
				if (toolName.includes('search') || toolName.includes('grep') || toolName.includes('index')) {
					return 'search';
				}
				if (toolName.includes('read') || toolName.includes('buffer') || toolName.includes('open')) {
					return 'read';
				}
				if (toolName.includes('edit') || toolName.includes('write') || toolName.includes('manipulate') || toolName.includes('diff')) {
					return 'edit';
				}
				if (toolName.includes('terminal') || toolName.includes('command')) {
					return 'terminal';
				}
			}
			return 'tool';
	}
}

function buildActivityDetail(kind: AgentActivityKind, args: Record<string, unknown>, verbosity: AgentActivityVerbosity): string | undefined {
	const path = getPathArg(args);
	const query = getQueryArg(args);
	const command = typeof args.command === 'string' ? args.command : undefined;
	switch (kind) {
		case 'search':
			return verbosity === 'minimal' ? undefined : query;
		case 'read':
		case 'edit':
			return verbosity === 'verbose' ? path : undefined;
		case 'terminal':
			return verbosity === 'verbose' ? command : undefined;
		case 'subagent':
			return typeof args.description === 'string' ? args.description : undefined;
		default:
			return sanitizeActivityDetailText(verbosity === 'verbose' ? JSON.stringify(args) : undefined);
	}
}

function buildActivityMessage(
	kind: AgentActivityKind,
	toolName: string,
	args: Record<string, unknown>,
	verbosity: AgentActivityVerbosity,
	phase: AgentActivityPhase,
): string {
	if (toolName === 'list_workspace_symbols') {
		return buildListSymbolsMessage(args, verbosity, phase);
	}
	if (toolName === 'search_workspace_text_batch') {
		const count = Array.isArray(args.queries) ? args.queries.length : 0;
		const detail = count > 0 ? `${count} queries` : 'batch';
		if (phase === 'running') {
			return verbosity === 'minimal' ? 'Grepping' : `Grepping (${detail})`;
		}
		if (phase === 'failed') {
			return 'Batch grep failed';
		}
		if (phase === 'cancelled') {
			return 'Batch grep cancelled';
		}
		return verbosity === 'minimal' ? 'Grepped' : `Grepped (${detail})`;
	}
	if (toolName === 'run_workspace_check') {
		const check = typeof args.check === 'string' ? args.check : 'check';
		if (phase === 'running') {
			return `Running ${check} check`;
		}
		if (phase === 'failed') {
			return `${check} check failed`;
		}
		if (phase === 'cancelled') {
			return `${check} check cancelled`;
		}
		return `${check} check passed`;
	}
	const path = getPathArg(args);
	const query = getQueryArg(args);
	const basename = path ? path.split(/[/\\]/).filter(Boolean).pop() ?? path : undefined;
	const quotedPath = path
		? (verbosity === 'verbose' ? `${path}${getLineRangeSuffix(args)}` : `\`${basename}\`${getLineRangeSuffix(args)}`)
		: undefined;
	const quotedQuery = query
		? (verbosity === 'minimal' ? undefined : verbosity === 'verbose' ? query : `\`${query}\``)
		: undefined;

	switch (kind) {
		case 'search':
			if (phase === 'running') {
				if (verbosity === 'minimal') {
					return 'Grepping';
				}
				return quotedQuery ? `Grepping for ${quotedQuery}` : 'Grepping workspace';
			}
			if (phase === 'failed') {
				return verbosity === 'minimal' ? 'Grep failed' : 'Grep failed';
			}
			if (phase === 'cancelled') {
				return 'Grep cancelled';
			}
			return verbosity === 'minimal' ? 'Grepped' : quotedQuery ? `Grepped for ${quotedQuery}` : 'Grepped workspace';
		case 'read':
			if (phase === 'running') {
				return quotedPath ? `Reading ${quotedPath}` : 'Reading file';
			}
			if (phase === 'failed') {
				return quotedPath ? `Failed to read ${quotedPath}` : 'Failed to read file';
			}
			if (phase === 'cancelled') {
				return quotedPath ? `Read ${quotedPath} cancelled` : 'Read cancelled';
			}
			return quotedPath ? `Read ${quotedPath}` : 'Read file';
		case 'edit':
			if (phase === 'running') {
				return quotedPath ? `Editing ${quotedPath}` : 'Editing file';
			}
			if (phase === 'failed') {
				return quotedPath ? `Failed to edit ${quotedPath}` : 'Failed to edit file';
			}
			if (phase === 'cancelled') {
				return 'Edit cancelled';
			}
			return quotedPath ? `Edited ${quotedPath}` : 'Edited file';
		case 'terminal':
			if (phase === 'running') {
				return verbosity === 'minimal' ? 'Running command' : 'Running terminal command';
			}
			if (phase === 'failed') {
				return 'Command failed';
			}
			if (phase === 'cancelled') {
				return 'Command cancelled';
			}
			return verbosity === 'minimal' ? 'Ran command' : 'Ran terminal command';
		case 'subagent':
			if (phase === 'running') {
				return 'Running subagent';
			}
			if (phase === 'failed') {
				return 'Subagent failed';
			}
			if (phase === 'cancelled') {
				return 'Subagent cancelled';
			}
			return 'Ran subagent';
		case 'reasoning':
		case 'plan':
			return phase === 'running' ? 'Planning' : 'Planned';
		default: {
			const humanName = toolName.replace(/_/g, ' ');
			if (phase === 'running') {
				return `Running ${humanName}`;
			}
			if (phase === 'failed') {
				return `${humanName} failed`;
			}
			if (phase === 'cancelled') {
				return `${humanName} cancelled`;
			}
			return `Ran ${humanName}`;
		}
	}
}

function getPathArg(args: Record<string, unknown>): string | undefined {
	return typeof args.path === 'string' ? args.path : typeof args.file_path === 'string' ? args.file_path : undefined;
}

function getQueryArg(args: Record<string, unknown>): string | undefined {
	return typeof args.query === 'string' ? args.query : typeof args.pattern === 'string' ? args.pattern : undefined;
}

function getLineNumberArg(args: Record<string, unknown>, key: 'startLine' | 'endLine', snakeKey: 'start_line' | 'end_line'): number | undefined {
	const value = args[key] ?? args[snakeKey];
	return typeof value === 'number' && Number.isFinite(value) ? Math.max(1, Math.floor(value)) : undefined;
}

function getLineRangeSuffix(args: Record<string, unknown>): string {
	const start = getLineNumberArg(args, 'startLine', 'start_line');
	if (start === undefined) {
		return '';
	}
	const end = getLineNumberArg(args, 'endLine', 'end_line');
	if (end !== undefined && end !== start) {
		return ` (lines ${start}-${end})`;
	}
	return ` (line ${start})`;
}

function buildListSymbolsMessage(args: Record<string, unknown>, verbosity: AgentActivityVerbosity, phase: AgentActivityPhase): string {
	const path = getPathArg(args);
	const basename = path ? path.split(/[/\\]/).filter(Boolean).pop() ?? path : undefined;
	const quotedPath = basename && verbosity !== 'minimal' ? `\`${basename}\`` : undefined;
	if (phase === 'running') {
		return quotedPath ? `Listing symbols in ${quotedPath}` : 'Listing symbols';
	}
	if (phase === 'failed') {
		return quotedPath ? `Failed to list symbols in ${quotedPath}` : 'Failed to list symbols';
	}
	if (phase === 'cancelled') {
		return 'List symbols cancelled';
	}
	return quotedPath ? `Listed symbols in ${quotedPath}` : 'Listed symbols';
}
