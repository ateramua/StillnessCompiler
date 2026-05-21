/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../../nls.js';
import {
	getAgentActivityKind,
	getAgentStatusActivityLabel,
	parseAgentActivityToolArguments,
	resolveAgentActivityProgressMessage,
	type AgentActivityKind,
	type AgentActivityVerbosity,
} from '../../../../../../platform/quantumide/common/agentActivityLabels.js';

function getPathArg(args: Record<string, unknown>): string | undefined {
	return typeof args.path === 'string' ? args.path : typeof args.file_path === 'string' ? args.file_path : undefined;
}

function getQueryArg(args: Record<string, unknown>): string | undefined {
	return typeof args.query === 'string' ? args.query : typeof args.pattern === 'string' ? args.pattern : undefined;
}

function basename(path: string): string {
	return path.split(/[/\\]/).filter(Boolean).pop() ?? path;
}

/**
 * Localized chat progress line for agent activity (NFR-5).
 * Falls back to English strings from {@link getAgentActivityLabel} for unknown tools.
 */
export function localizeAgentActivityProgressMessage(
	toolName: string,
	displayName: string | undefined,
	toolInput: string | undefined,
	isComplete: boolean,
	success: boolean | undefined,
	verbosity: AgentActivityVerbosity = 'normal',
): string {
	const args = parseAgentActivityToolArguments(toolInput);
	const kind = getAgentActivityKind(toolName);
	const path = getPathArg(args);
	const query = getQueryArg(args);
	const fileBase = path ? basename(path) : undefined;

	let message: string | undefined;
	if (isComplete && success === false) {
		message = localizeFailed(kind, fileBase, query, verbosity);
	} else if (isComplete) {
		message = localizeCompleted(kind, fileBase, query, verbosity);
	} else {
		message = localizeRunning(kind, fileBase, query, verbosity, toolName);
	}
	if (message) {
		return message;
	}
	return resolveAgentActivityProgressMessage(toolName, displayName, toolInput, isComplete, success, verbosity);
}

export function localizeAgentSessionActivity(activity: string): string {
	const thinking = getAgentStatusActivityLabel('thinking');
	const working = getAgentStatusActivityLabel('working');
	const reasoning = getAgentStatusActivityLabel('reasoning');
	if (activity === thinking) {
		return localize('agentActivity.thinking', "Thinking…");
	}
	if (activity === reasoning) {
		return localize('agentActivity.reasoning', "Reasoning…");
	}
	if (activity === working) {
		return localize('agentActivity.working', "Working…");
	}
	if (activity.toLowerCase().includes('planning')) {
		return localize('agentActivity.planning', "Planning…");
	}
	return activity;
}

function localizeRunning(kind: AgentActivityKind, fileBase: string | undefined, query: string | undefined, verbosity: AgentActivityVerbosity, _toolName: string): string | undefined {
	switch (kind) {
		case 'search':
			if (verbosity === 'minimal') {
				return localize('agentActivity.grepping', "Grepping");
			}
			return query
				? localize('agentActivity.greppingFor', "Grepping for `{0}`", query)
				: localize('agentActivity.greppingWorkspace', "Grepping workspace");
		case 'read':
			return fileBase
				? localize('agentActivity.readingFile', "Reading `{0}`", fileBase)
				: localize('agentActivity.reading', "Reading file");
		case 'edit':
			return fileBase
				? localize('agentActivity.editingFile', "Editing `{0}`", fileBase)
				: localize('agentActivity.editing', "Editing file");
		case 'terminal':
			return verbosity === 'minimal'
				? localize('agentActivity.runningCommand', "Running command")
				: localize('agentActivity.runningTerminal', "Running terminal command");
		case 'subagent':
			return localize('agentActivity.runningSubagent', "Running subagent");
		case 'reasoning':
		case 'plan':
			return localize('agentActivity.planningShort', "Planning");
		default:
			return undefined;
	}
}

function localizeCompleted(kind: AgentActivityKind, fileBase: string | undefined, query: string | undefined, verbosity: AgentActivityVerbosity): string | undefined {
	switch (kind) {
		case 'search':
			if (verbosity === 'minimal') {
				return localize('agentActivity.grepped', "Grepped");
			}
			return query
				? localize('agentActivity.greppedFor', "Grepped for `{0}`", query)
				: localize('agentActivity.greppedWorkspace', "Grepped workspace");
		case 'read':
			return fileBase
				? localize('agentActivity.readFile', "Read `{0}`", fileBase)
				: localize('agentActivity.readFileGeneric', "Read file");
		case 'edit':
			return fileBase
				? localize('agentActivity.editedFile', "Edited `{0}`", fileBase)
				: localize('agentActivity.edited', "Edited file");
		case 'terminal':
			return verbosity === 'minimal'
				? localize('agentActivity.ranCommand', "Ran command")
				: localize('agentActivity.ranTerminal', "Ran terminal command");
		case 'subagent':
			return localize('agentActivity.ranSubagent', "Ran subagent");
		default:
			return undefined;
	}
}

function localizeFailed(kind: AgentActivityKind, fileBase: string | undefined, _query: string | undefined, _verbosity: AgentActivityVerbosity): string | undefined {
	switch (kind) {
		case 'search':
			return localize('agentActivity.grepFailed', "Grep failed");
		case 'read':
			return fileBase
				? localize('agentActivity.readFailed', "Failed to read `{0}`", fileBase)
				: localize('agentActivity.readFailedGeneric', "Failed to read file");
		case 'edit':
			return fileBase
				? localize('agentActivity.editFailed', "Failed to edit `{0}`", fileBase)
				: localize('agentActivity.editFailedGeneric', "Failed to edit file");
		case 'terminal':
			return localize('agentActivity.commandFailed', "Command failed");
		default:
			return undefined;
	}
}
