/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../../base/common/uri.js';
import { ActionType, type SessionAction, type SessionToolCallCompleteAction, type SessionToolCallReadyAction, type SessionToolCallStartAction } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { ToolCallConfirmationReason, ToolCallStatus, type ToolCallState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import type { IChatProgress } from '../../../common/chatService/chatService.js';
import { ChatToolInvocation } from '../../../common/model/chatProgressTypes/chatToolInvocation.js';
import { IChatToolInvocation } from '../../../common/chatService/chatService.js';
import { completedToolCallToSerialized, finalizeToolInvocation, toolCallStateToInvocation } from './stateToProgressAdapter.js';

export class OpenAIRawToolProgressRouter {
	private readonly _tools = new Map<string, { state: ToolCallState; invocation: ChatToolInvocation }>();
	private _activityStepCount = 0;

	constructor(
		private readonly _sessionResource: URI,
		private readonly _connectionAuthority: string | undefined,
		private readonly _maxActivityStepsPerTurn: number = 50,
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
			return [];
		}
		this._activityStepCount++;
		const state: ToolCallState = {
			status: ToolCallStatus.Running,
			toolCallId: action.toolCallId,
			toolName: action.toolName,
			displayName: action.displayName,
			invocationMessage: action.displayName,
			confirmed: ToolCallConfirmationReason.NotNeeded,
			_meta: action._meta,
		};
		const invocation = toolCallStateToInvocation(state, undefined, this._sessionResource, this._connectionAuthority);
		this._tools.set(action.toolCallId, { state, invocation });
		return [invocation];
	}

	private _handleReady(action: SessionToolCallReadyAction): IChatProgress[] {
		const existing = this._tools.get(action.toolCallId);
		const base = {
			toolCallId: action.toolCallId,
			toolName: existing?.state.toolName ?? 'tool',
			displayName: existing?.state.displayName ?? 'Tool',
			invocationMessage: action.invocationMessage,
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
		const invocation = toolCallStateToInvocation(state, undefined, this._sessionResource, this._connectionAuthority);
		this._tools.set(action.toolCallId, { state, invocation });
		return [invocation];
	}

	private _handleComplete(action: SessionToolCallCompleteAction): IChatProgress[] {
		const existing = this._tools.get(action.toolCallId);
		const state: ToolCallState = {
			status: ToolCallStatus.Completed,
			toolCallId: action.toolCallId,
			toolName: existing?.state.toolName ?? 'tool',
			displayName: existing?.state.displayName ?? 'Tool',
			invocationMessage: existing?.state.invocationMessage ?? 'Tool',
			confirmed: existing?.state && 'confirmed' in existing.state ? existing.state.confirmed : ToolCallConfirmationReason.NotNeeded,
			success: action.result.success,
			pastTenseMessage: action.result.pastTenseMessage,
			content: action.result.content,
			error: action.result.error,
			_meta: existing?.state._meta,
		};
		if (existing && !IChatToolInvocation.isComplete(existing.invocation)) {
			finalizeToolInvocation(existing.invocation, state, this._sessionResource, this._connectionAuthority);
			this._tools.delete(action.toolCallId);
			return [];
		}
		return [completedToolCallToSerialized(state, undefined, this._sessionResource, this._connectionAuthority)];
	}
}
