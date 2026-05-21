/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { autorun } from '../../base/common/observable.js';
import { Disposable } from '../../base/common/lifecycle.js';
import { isQuantumIDEProduct } from '../../platform/quantumide/common/quantumideChatPlatform.js';
import { IAgentHostService } from '../../platform/agentHost/common/agentService.js';
import { ActionType, isSessionAction, type StateAction } from '../../platform/agentHost/common/state/sessionActions.js';
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from '../common/contributions.js';
import product from '../../platform/product/common/product.js';
import { IConfigurationService } from '../../platform/configuration/common/configuration.js';
import { QuantumIDEAISettingId } from '../../platform/quantumide/common/quantumideAISettings.js';
import {
	mapExecutionGraphPhase,
	mapSessionActivityToTaskPhase,
	mapToolNameToTaskPhase,
} from '../../platform/quantumide/common/quantumideAgentTaskPhase.js';
import { IQuantumIDEAgentTaskPhaseStatusService } from '../services/quantumide/common/quantumideAgentTaskPhaseStatus.js';
import { IQuantumIDEAgentTaskOrchestratorService } from '../services/quantumide/common/quantumideAgentTask.js';
import { IQuantumIDEExecutionGraphService } from '../services/quantumide/common/quantumideExecutionGraph.js';
import { IChatService } from '../contrib/chat/common/chatService/chatService.js';
function isQuantumIDE(): boolean {
	return isQuantumIDEProduct(product.applicationName)
		|| [product.nameShort, product.nameLong].some(n => typeof n === 'string' && n.toLowerCase().includes('quantumide'));
}

class QuantumIDEAgentTaskPhaseBridgeContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.quantumideAgentTaskPhaseBridge';

	constructor(
		@IAgentHostService private readonly _agentHost: IAgentHostService,
		@IQuantumIDEAgentTaskPhaseStatusService private readonly _phaseStatus: IQuantumIDEAgentTaskPhaseStatusService,
		@IQuantumIDEAgentTaskOrchestratorService private readonly _tasks: IQuantumIDEAgentTaskOrchestratorService,
		@IQuantumIDEExecutionGraphService private readonly _graph: IQuantumIDEExecutionGraphService,
		@IChatService private readonly _chatService: IChatService,
		@IConfigurationService private readonly _config: IConfigurationService,
	) {
		super();
		if (!isQuantumIDE() || this._config.getValue<boolean>(QuantumIDEAISettingId.AgentTaskPhaseStatusEnabled) === false) {
			return;
		}

		this._register(this._agentHost.onDidAction(envelope => {
			this._handleAction(envelope.action);
		}));

		this._register(this._tasks.onDidChange(() => {
			const state = this._tasks.getState();
			switch (state.status) {
				case 'planning':
					this._phaseStatus.setPhase('planning', { message: state.title, detail: state.planSummary, force: true });
					break;
				case 'running': {
					const step = state.steps.find(s => s.id === state.currentStepId);
					this._phaseStatus.setPhase('analyzing', { message: step?.label ?? state.title, force: true });
					break;
				}
				case 'completed':
					this._phaseStatus.setPhase('done', { message: state.title, force: true });
					this._phaseStatus.clear();
					break;
				case 'failed':
					this._phaseStatus.setPhase('error', { message: state.lastError ?? state.title, force: true });
					this._phaseStatus.clear();
					break;
				case 'cancelled':
					this._phaseStatus.setPhase('ready', { force: true });
					this._phaseStatus.clear();
					break;
				case 'paused':
					this._phaseStatus.setPhase('ready', { message: state.title, force: true });
					break;
				case 'idle':
					break;
			}
		}));

		this._register(this._graph.onDidChange(() => {
			const running = this._graph.getNodes().find(n => n.status === 'running');
			if (running) {
				this._phaseStatus.setPhase(mapExecutionGraphPhase(running.phase), {
					message: running.label,
					detail: running.error,
				});
			}
		}));

		this._register(autorun(reader => {
			const inProgress = this._chatService.requestInProgressObs.read(reader);
			if (!inProgress) {
				const state = this._phaseStatus.getState();
				if (state.phase !== 'error' && state.phase !== 'done') {
					this._phaseStatus.setPhase('ready', { force: true });
				}
			} else if (this._phaseStatus.getState().phase === 'idle' || this._phaseStatus.getState().phase === 'ready') {
				this._phaseStatus.setPhase('planning', { force: true });
			}
		}));
	}

	private _handleAction(action: StateAction): void {
		if (!isSessionAction(action)) {
			return;
		}
		const sessionId = 'session' in action ? String(action.session) : undefined;
		const turnId = 'turnId' in action ? action.turnId : undefined;

		switch (action.type) {
			case ActionType.SessionTurnStarted:
				this._phaseStatus.setPhase('planning', { sessionId, turnId, force: true });
				break;
			case ActionType.SessionActivityChanged: {
				const phase = mapSessionActivityToTaskPhase('activity' in action ? action.activity : undefined);
				if (phase) {
					this._phaseStatus.setPhase(phase, {
						message: 'activity' in action ? action.activity : undefined,
						sessionId,
						force: phase === 'ready',
					});
				}
				break;
			}
			case ActionType.SessionReasoning:
				this._phaseStatus.setPhase('planning', { sessionId, turnId });
				break;
			case ActionType.SessionToolCallStart: {
				const meta = (action as { _meta?: { toolKind?: string } })._meta;
				const phase = mapToolNameToTaskPhase(action.toolName, meta?.toolKind);
				this._phaseStatus.setPhase(phase, {
					message: action.displayName,
					sessionId,
					turnId,
					toolName: action.toolName,
					force: true,
				});
				break;
			}
			case ActionType.SessionToolCallComplete: {
				const ok = action.result.success;
				if (!ok) {
					const msg = typeof action.result.pastTenseMessage === 'string'
						? action.result.pastTenseMessage
						: 'markdown' in action.result.pastTenseMessage
							? action.result.pastTenseMessage.markdown
							: 'Tool failed';
					this._phaseStatus.setPhase('error', {
						message: msg,
						sessionId,
						turnId,
						toolName: action.toolCallId,
						force: true,
					});
				}
				break;
			}
			case ActionType.SessionTurnComplete:
				this._phaseStatus.setPhase('done', { sessionId, turnId, force: true });
				this._phaseStatus.clear();
				break;
			case ActionType.SessionTurnCancelled:
				this._phaseStatus.setPhase('ready', { sessionId, turnId, force: true });
				this._phaseStatus.clear();
				break;
			case ActionType.SessionError:
				this._phaseStatus.setPhase('error', {
					message: action.error.message,
					detail: action.error.errorType,
					sessionId,
					force: true,
				});
				this._phaseStatus.clear();
				break;
			case ActionType.SessionDelta:
				if (this._phaseStatus.getState().phase === 'planning' || this._phaseStatus.getState().phase === 'ready') {
					this._phaseStatus.setPhase('analyzing', { sessionId, turnId });
				}
				break;
			default:
				break;
		}
	}
}

if (isQuantumIDE()) {
	registerWorkbenchContribution2(QuantumIDEAgentTaskPhaseBridgeContribution.ID, QuantumIDEAgentTaskPhaseBridgeContribution, WorkbenchPhase.AfterRestored);
}
