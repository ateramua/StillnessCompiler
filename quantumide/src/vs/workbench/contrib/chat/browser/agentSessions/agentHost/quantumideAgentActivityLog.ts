/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { Registry } from '../../../../../../platform/registry/common/platform.js';
import { localize } from '../../../../../../nls.js';
import type { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { ActionType, isSessionAction, type StateAction } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { QuantumIDEAISettingId } from '../../../../../../platform/quantumide/common/quantumideAISettings.js';
import { Extensions, IOutputChannelRegistry, type IOutputChannel } from '../../../../../services/output/common/output.js';
import { IOutputService } from '../../../../../services/output/common/output.js';

export const QuantumIDEAgentActivityOutputChannelId = 'quantumide.agent.activity';

/**
 * Debug/support timeline for agent activity steps in the QuantumIDE Agent output channel.
 */
export class QuantumIDEAgentActivityLogger extends Disposable {

	private readonly _channel: IOutputChannel;

	constructor(
		connection: IAgentConnection,
		outputService: IOutputService,
		private readonly _configurationService: IConfigurationService,
	) {
		super();
		const registry = Registry.as<IOutputChannelRegistry>(Extensions.OutputChannels);
		if (!registry.getChannel(QuantumIDEAgentActivityOutputChannelId)) {
			registry.registerChannel({
				id: QuantumIDEAgentActivityOutputChannelId,
				label: localize('quantumide.agentActivity.channel', 'QuantumIDE Agent'),
				log: true,
				languageId: 'log',
			});
		}
		const channel = outputService.getChannel(QuantumIDEAgentActivityOutputChannelId);
		if (!channel) {
			throw new Error(`Failed to register ${QuantumIDEAgentActivityOutputChannelId} output channel`);
		}
		this._channel = channel;
		this._register(connection.onDidAction(envelope => {
			if (!this._isEnabled()) {
				return;
			}
			this._logAction(envelope.action);
		}));
	}

	private _isEnabled(): boolean {
		return this._configurationService.getValue<boolean>(QuantumIDEAISettingId.AgentActivityDebugOutput) !== false;
	}

	private _logAction(action: StateAction): void {
		if (!isSessionAction(action)) {
			return;
		}
		switch (action.type) {
			case ActionType.SessionActivityChanged:
				this._append(action.activity ? `[activity] ${action.activity}` : '[activity] cleared');
				break;
			case ActionType.SessionToolCallStart:
				this._append(`[tool start] ${action.displayName} (${action.toolName}) turn=${action.turnId}`);
				break;
			case ActionType.SessionToolCallReady:
				this._append(`[tool ready] ${action.toolCallId} confirmed=${action.confirmed}`);
				break;
			case ActionType.SessionToolCallComplete:
				this._append(`[tool ${action.result.success ? 'done' : 'failed'}] ${action.toolCallId}`);
				break;
			case ActionType.SessionTurnStarted:
				this._append(`[turn start] ${action.turnId}`);
				break;
			case ActionType.SessionTurnComplete:
				this._append(`[turn complete] ${action.turnId}`);
				break;
			case ActionType.SessionTurnCancelled:
				this._append(`[turn cancelled] ${action.turnId}`);
				break;
			case ActionType.SessionError:
				this._append(`[error] ${action.error.message}`);
				break;
		}
	}

	private _append(line: string): void {
		this._channel.append(`${new Date().toISOString()} ${line}\n`);
	}
}
