/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { joinPath } from '../../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { URI } from '../../../../../../base/common/uri.js';
import type { Location } from '../../../../../../editor/common/languages.js';
import { getToolKind } from '../../../../../../platform/agentHost/common/state/sessionReducers.js';
import { getToolOutputText, ToolCallStatus, type ToolCallState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { toAgentHostUri } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import {
	getAgentActivityIconId,
	getAgentActivityKind,
	parseAgentActivityToolArguments,
	resolveAgentActivityDisplayName,
	type AgentActivityVerbosity,
} from '../../../../../../platform/quantumide/common/agentActivityLabels.js';
import {
	type IChatSimpleToolInvocationData,
	type IChatToolResourcesInvocationData,
} from '../../../common/chatService/chatService.js';
import { type IToolData, ToolDataSource } from '../../../common/tools/languageModelToolsService.js';
import { localizeAgentActivityProgressMessage } from './agentActivityLocalizedLabels.js';

export function buildAgentActivityToolData(
	toolName: string,
	displayName: string | undefined,
	toolInput: string | undefined,
	verbosity: AgentActivityVerbosity = 'normal',
): IToolData {
	const kind = getAgentActivityKind(toolName);
	return {
		id: toolName,
		source: ToolDataSource.Internal,
		displayName: resolveAgentActivityDisplayName(toolName, displayName, toolInput, verbosity),
		modelDescription: toolName,
		icon: ThemeIcon.fromId(getAgentActivityIconId(kind)),
	};
}

export function resolveLocalizedAgentActivityProgressMessage(
	toolName: string,
	displayName: string | undefined,
	toolInput: string | undefined,
	isComplete: boolean,
	success: boolean | undefined,
	verbosity: AgentActivityVerbosity = 'normal',
): string {
	return localizeAgentActivityProgressMessage(toolName, displayName, toolInput, isComplete, success, verbosity);
}

export function buildAgentActivityToolSpecificData(
	tc: ToolCallState,
	workingDirectory: URI | undefined,
	connectionAuthority: string | undefined,
	verbosity: AgentActivityVerbosity,
): IChatSimpleToolInvocationData | IChatToolResourcesInvocationData | undefined {
	if (tc.status !== ToolCallStatus.Completed) {
		return undefined;
	}
	const kind = getToolKind(tc) || getAgentActivityKind(tc.toolName);
	const args = parseAgentActivityToolArguments('toolInput' in tc ? tc.toolInput : undefined);
	const output = getToolOutputText(tc);

	if (kind === 'read') {
		const pathArg = typeof args.path === 'string' ? args.path : typeof args.file_path === 'string' ? args.file_path : undefined;
		if (!pathArg) {
			return undefined;
		}
		const resource = resolveWorkspacePath(workingDirectory, pathArg);
		const uri = connectionAuthority ? toAgentHostUri(resource, connectionAuthority) : resource;
		const startLine = getLineNumberArg(args, 'startLine', 'start_line');
		if (startLine !== undefined) {
			const endLine = getLineNumberArg(args, 'endLine', 'end_line') ?? startLine;
			const location: Location = {
				uri,
				range: {
					startLineNumber: startLine,
					startColumn: 1,
					endLineNumber: endLine,
					endColumn: 1,
				},
			};
			return { kind: 'resources', values: [location] };
		}
		return { kind: 'resources', values: [uri] };
	}

	if (kind === 'search' && verbosity !== 'minimal' && output) {
		const query = typeof args.query === 'string' ? args.query : typeof args.pattern === 'string' ? args.pattern : '';
		return { kind: 'simpleToolInvocation', input: query, output };
	}

	return undefined;
}

function getLineNumberArg(args: Record<string, unknown>, key: 'startLine' | 'endLine', snakeKey: 'start_line' | 'end_line'): number | undefined {
	const value = args[key] ?? args[snakeKey];
	return typeof value === 'number' && Number.isFinite(value) ? Math.max(1, Math.floor(value)) : undefined;
}

function resolveWorkspacePath(workingDirectory: URI | undefined, pathArg: string): URI {
	if (/^[a-zA-Z]:[\\/]/.test(pathArg) || pathArg.startsWith('/')) {
		return URI.file(pathArg);
	}
	if (workingDirectory) {
		return joinPath(workingDirectory, pathArg);
	}
	return URI.file(pathArg);
}
