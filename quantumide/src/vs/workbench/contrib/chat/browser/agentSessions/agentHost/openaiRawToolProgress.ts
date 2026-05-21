/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../../base/common/uri.js';
import { ActionType, type SessionAction, type SessionToolCallCompleteAction, type SessionToolCallReadyAction, type SessionToolCallStartAction } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { type ConfirmationOption } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { ToolCallConfirmationReason, ToolCallStatus, type ToolCallState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import type { IChatProgress } from '../../../common/chatService/chatService.js';
import { ChatToolInvocation } from '../../../common/model/chatProgressTypes/chatToolInvocation.js';
import { IChatToolInvocation } from '../../../common/chatService/chatService.js';
import {
	formatActivityCapSummaryMessage,
	shouldCoalesceActivityLabels,
} from '../../../../../../platform/quantumide/common/agentActivityProgress.js';
import {
	getAgentActivityLabel,
	parseAgentActivityToolArguments,
	resolveAgentActivityProgressMessage,
	type AgentActivityVerbosity,
} from '../../../../../../platform/quantumide/common/agentActivityLabels.js';
import { agentActivityChatProgressMessage } from './agentActivityChatProgress.js';
import { completedToolCallToSerialized, finalizeToolInvocation, toolCallStateToInvocation } from './stateToProgressAdapter.js';

export type QuantumIDEProposeFileEditPreviewHandler = (toolCallId: string, path: string, replacement: string) => void;

export type QuantumIDEToolPendingConfirmationHandler = (
	invocation: ChatToolInvocation,
	toolCallId: string,
	options?: ConfirmationOption[],
) => void;

export class OpenAIRawToolProgressRouter {
	private readonly _tools = new Map<string, { state: ToolCallState; invocation: ChatToolInvocation }>();
	private _activityStepCount = 0;
	private _suppressedAfterCap = 0;
	private _capSummaryEmitted = false;
	private readonly _previewedFileEdits = new Set<string>();
	private _lastCoalesceLabel: string | undefined;
	private _lastCoalesceAt: number | undefined;

	constructor(
		private readonly _sessionResource: URI,
		private readonly _connectionAuthority: string | undefined,
		private readonly _maxActivityStepsPerTurn: number = 50,
		private readonly _workingDirectory: URI | undefined = undefined,
		private readonly _verbosity: AgentActivityVerbosity = 'normal',
		private readonly _proposeFileEditPreview: QuantumIDEProposeFileEditPreviewHandler | undefined = undefined,
		private readonly _onPendingConfirmation: QuantumIDEToolPendingConfirmationHandler | undefined = undefined,
	) { }

	handleAction(action: SessionAction): IChatProgress[] {
		switch (action.type) {
			case ActionType.SessionToolCallStart:
				return this._handleStart(action);
			case ActionType.SessionToolCallReady:
				return this._handleReady(action);
			case ActionType.SessionToolCallComplete:
				return this._handleComplete(action);
			default:
				return [];
		}
	}

	dispose(): void {
		for (const { invocation } of this._tools.values()) {
			if (!IChatToolInvocation.isComplete(invocation)) {
				invocation.didExecuteTool(undefined);
			}
		}
		this._tools.clear();
	}

	private _handleStart(action: SessionToolCallStartAction): IChatProgress[] {
		if (this._activityStepCount >= this._maxActivityStepsPerTurn) {
			this._suppressedAfterCap++;
			if (!this._capSummaryEmitted) {
				this._capSummaryEmitted = true;
				return [agentActivityChatProgressMessage(formatActivityCapSummaryMessage(this._suppressedAfterCap), false)];
			}
			return [];
		}
		const toolInput = 'toolInput' in action && typeof action.toolInput === 'string' ? action.toolInput : undefined;
		const args = parseAgentActivityToolArguments(toolInput);
		const activity = getAgentActivityLabel(action.toolName, args, this._verbosity);
		const runningLabel = action.displayName ?? activity.runningLabel;
		const now = Date.now();
		if (shouldCoalesceActivityLabels(this._lastCoalesceLabel, this._lastCoalesceAt, runningLabel, now)) {
			return [];
		}
		this._lastCoalesceLabel = runningLabel;
		this._lastCoalesceAt = now;
		this._activityStepCount++;
		const state: ToolCallState = {
			status: ToolCallStatus.Running,
			toolCallId: action.toolCallId,
			toolName: action.toolName,
			displayName: runningLabel,
			invocationMessage: runningLabel,
			toolInput,
			confirmed: ToolCallConfirmationReason.NotNeeded,
			_meta: action._meta,
		};
		const invocation = toolCallStateToInvocation(state, undefined, this._sessionResource, this._connectionAuthority, this._workingDirectory, this._verbosity);
		this._tools.set(action.toolCallId, { state, invocation });
		return [invocation];
	}

	private _handleReady(action: SessionToolCallReadyAction): IChatProgress[] {
		this._maybePreviewProposedFileEdit(action);
		const existing = this._tools.get(action.toolCallId);
		const args = parseAgentActivityToolArguments(action.toolInput);
		const activity = getAgentActivityLabel(existing?.state.toolName ?? 'tool', args, this._verbosity);
		const runningLabel = resolveAgentActivityProgressMessage(
			existing?.state.toolName ?? 'tool',
			existing?.state.displayName,
			action.toolInput,
			false,
			undefined,
			this._verbosity,
		);
		const base = {
			toolCallId: action.toolCallId,
			toolName: existing?.state.toolName ?? 'tool',
			displayName: existing?.state.displayName ?? activity.runningLabel,
			invocationMessage: runningLabel,
			confirmationTitle: action.confirmationTitle,
			toolInput: action.toolInput,
			confirmed: action.confirmed ?? ToolCallConfirmationReason.NotNeeded,
			options: action.options,
			editable: action.editable,
			_meta: existing?.state._meta,
		};
		const state: ToolCallState = action.confirmed === ToolCallConfirmationReason.NotNeeded
			? { ...base, status: ToolCallStatus.Running }
			: { ...base, status: ToolCallStatus.PendingConfirmation };
		const invocation = toolCallStateToInvocation(state, undefined, this._sessionResource, this._connectionAuthority, this._workingDirectory, this._verbosity);
		this._tools.set(action.toolCallId, { state, invocation });
		if (state.status === ToolCallStatus.PendingConfirmation && this._onPendingConfirmation) {
			this._onPendingConfirmation(invocation, action.toolCallId, action.options);
		}
		return [invocation];
	}

	private _maybePreviewProposedFileEdit(action: SessionToolCallReadyAction): void {
		if (!this._proposeFileEditPreview || this._previewedFileEdits.has(action.toolCallId)) {
			return;
		}
		const existing = this._tools.get(action.toolCallId);
		if (existing?.state.toolName !== 'propose_file_edit' || !action.toolInput) {
			return;
		}
		try {
			const args = JSON.parse(action.toolInput) as { path?: string; replacement?: string };
			if (typeof args.path === 'string' && typeof args.replacement === 'string') {
				this._previewedFileEdits.add(action.toolCallId);
				this._proposeFileEditPreview(action.toolCallId, args.path, args.replacement);
			}
		} catch {
			// ignore malformed tool input
		}
	}

	private _handleComplete(action: SessionToolCallCompleteAction): IChatProgress[] {
		const existing = this._tools.get(action.toolCallId);
		const state: ToolCallState = {
			status: ToolCallStatus.Completed,
			toolCallId: action.toolCallId,
			toolName: existing?.state.toolName ?? 'tool',
			displayName: existing?.state.displayName ?? 'Tool',
			invocationMessage: existing?.state.invocationMessage ?? 'Tool',
			toolInput: existing?.state && 'toolInput' in existing.state ? existing.state.toolInput : undefined,
			confirmed: existing?.state && 'confirmed' in existing.state ? existing.state.confirmed : ToolCallConfirmationReason.NotNeeded,
			success: action.result.success,
			pastTenseMessage: action.result.pastTenseMessage,
			content: action.result.content,
			error: action.result.error,
			_meta: existing?.state._meta,
		};
		if (existing && !IChatToolInvocation.isComplete(existing.invocation)) {
			finalizeToolInvocation(existing.invocation, state, this._sessionResource, this._connectionAuthority, this._workingDirectory, this._verbosity);
			this._tools.delete(action.toolCallId);
			return [];
		}
		return [completedToolCallToSerialized(state, undefined, this._sessionResource, this._connectionAuthority, this._workingDirectory, this._verbosity)];
	}
}
