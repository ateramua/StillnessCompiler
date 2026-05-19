/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

export type AgentActivityKind = 'search' | 'read' | 'edit' | 'terminal' | 'tool' | 'reasoning' | 'plan' | 'subagent' | 'status' | 'error';
export type AgentActivityVerbosity = 'minimal' | 'normal' | 'verbose';

export interface IAgentActivityLabel {
	readonly kind: AgentActivityKind;
	readonly label: string;
	readonly detail?: string;
}

export function getAgentActivityLabel(toolName: string, args: Record<string, unknown>, verbosity: AgentActivityVerbosity = 'normal'): IAgentActivityLabel {
	const path = typeof args.path === 'string' ? args.path : typeof args.file_path === 'string' ? args.file_path : undefined;
	const query = typeof args.query === 'string' ? args.query : typeof args.pattern === 'string' ? args.pattern : undefined;
	const command = typeof args.command === 'string' ? args.command : undefined;
	const basename = path ? path.split(/[/\\]/).filter(Boolean).pop() ?? path : undefined;

	switch (toolName) {
		case 'search_workspace_text':
		case 'grep':
		case 'Grep':
		case 'codebase_search':
		case 'codebase-search':
			return {
				kind: 'search',
				label: 'Searched workspace',
				detail: query,
			};
		case 'read_workspace_file':
		case 'read_file':
		case 'Read':
			return {
				kind: 'read',
				label: basename ? `Read ${basename}` : 'Read file',
				detail: path,
			};
		case 'propose_file_edit':
		case 'write':
		case 'Write':
		case 'edit_file':
		case 'str_replace_editor':
		case 'apply_patch':
			return {
				kind: 'edit',
				label: basename ? `Edited ${basename}` : 'Proposed file edit',
				detail: typeof args.summary === 'string' ? args.summary : path,
			};
		case 'propose_terminal_command':
		case 'bash':
		case 'shell':
		case 'run_terminal_cmd':
		case 'run_terminal_command':
			return {
				kind: 'terminal',
				label: verbosity === 'minimal' ? 'Ran terminal command' : 'Ran command',
				detail: command,
			};
		case 'task':
			return {
				kind: 'subagent',
				label: 'Subagent task',
				detail: typeof args.description === 'string' ? args.description : undefined,
			};
		default:
			return {
				kind: 'tool',
				label: toolName.replace(/_/g, ' '),
				detail: verbosity === 'verbose' ? JSON.stringify(args) : undefined,
			};
	}
}

export function getAgentActivityDisplayName(toolName: string, args: Record<string, unknown> = {}): string {
	return getAgentActivityLabel(toolName, args).label;
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

export function getAgentStatusActivityLabel(status: 'thinking' | 'working'): string {
	return status === 'thinking' ? 'Thinking…' : 'Working…';
}

export function resolveAgentActivityDisplayName(toolName: string, displayName: string | undefined, toolInput: string | undefined, verbosity: AgentActivityVerbosity = 'normal'): string {
	const normalizedDefault = toolName.replace(/_/g, ' ');
	if (displayName && displayName !== toolName && displayName !== normalizedDefault) {
		return displayName;
	}
	return getAgentActivityLabel(toolName, parseAgentActivityToolArguments(toolInput), verbosity).label;
}
