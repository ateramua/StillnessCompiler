/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { autorun } from '../../base/common/observable.js';
import { Disposable } from '../../base/common/lifecycle.js';
import { localize, localize2 } from '../../nls.js';
import { Action2, registerAction2 } from '../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../platform/instantiation/common/instantiation.js';
import { ICommandService } from '../../platform/commands/common/commands.js';
import { isQuantumIDEProduct } from '../../platform/quantumide/common/quantumideChatPlatform.js';
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from '../common/contributions.js';
import product from '../../platform/product/common/product.js';
import { IChatService } from '../contrib/chat/common/chatService/chatService.js';
import { IQuantumIDEAgentTaskOrchestratorService } from '../services/quantumide/common/quantumideAgentTask.js';
import { INotificationService } from '../../platform/notification/common/notification.js';

function isQuantumIDE(): boolean {
	return isQuantumIDEProduct(product.applicationName)
		|| [product.nameShort, product.nameLong].some(n => typeof n === 'string' && n.toLowerCase().includes('quantumide'));
}

class QuantumIDEAgentTaskBridgeContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.quantumideAgentTaskBridge';

	constructor(
		@IChatService private readonly _chatService: IChatService,
		@IQuantumIDEAgentTaskOrchestratorService private readonly _tasks: IQuantumIDEAgentTaskOrchestratorService,
	) {
		super();
		if (!isQuantumIDE()) {
			return;
		}
		this._register(this._chatService.onDidSubmitRequest(() => {
			const state = this._tasks.getState();
			if (state.status === 'idle' || state.status === 'completed' || state.status === 'cancelled' || state.status === 'failed') {
				this._tasks.beginTask(
					localize('quantumide.agentTask.chatTurn', 'Agent chat turn'),
					[localize('quantumide.agentTask.step.chat', 'Process chat request')],
				);
			}
		}));
		this._register(autorun(reader => {
			const inProgress = this._chatService.requestInProgressObs.read(reader);
			const state = this._tasks.getState();
			if (inProgress && state.status === 'planning') {
				const first = state.steps[0];
				if (first?.status === 'pending') {
					void this._tasks.startStep(first.id);
				}
			}
			if (!inProgress && (state.status === 'running' || state.status === 'planning')) {
				const running = state.steps.find(s => s.status === 'running');
				if (running) {
					void this._tasks.completeStep(running.id);
				} else if (state.steps.every(s => s.status === 'pending')) {
					this._tasks.pause();
				}
			}
		}));
	}
}

if (isQuantumIDE()) {
	registerWorkbenchContribution2(QuantumIDEAgentTaskBridgeContribution.ID, QuantumIDEAgentTaskBridgeContribution, WorkbenchPhase.AfterRestored);

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'quantumide.agent.pause',
				title: localize2('quantumide.agent.pause', 'QuantumIDE: Pause Agent Task'),
				category: { value: localize('quantumide.production', 'QuantumIDE Production'), original: 'QuantumIDE Production' },
				f1: true,
			});
		}
		override run(accessor: ServicesAccessor): void {
			accessor.get(IQuantumIDEAgentTaskOrchestratorService).pause();
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'quantumide.agent.resume',
				title: localize2('quantumide.agent.resume', 'QuantumIDE: Resume Agent Task'),
				category: { value: localize('quantumide.production', 'QuantumIDE Production'), original: 'QuantumIDE Production' },
				f1: true,
			});
		}
		override run(accessor: ServicesAccessor): void {
			accessor.get(IQuantumIDEAgentTaskOrchestratorService).resume();
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'quantumide.agent.abort',
				title: localize2('quantumide.agent.abort', 'QuantumIDE: Abort Agent Task'),
				category: { value: localize('quantumide.production', 'QuantumIDE Production'), original: 'QuantumIDE Production' },
				f1: true,
			});
		}
		override async run(accessor: ServicesAccessor): Promise<void> {
			await accessor.get(ICommandService).executeCommand('workbench.action.chat.cancel');
			await accessor.get(IQuantumIDEAgentTaskOrchestratorService).abort();
			accessor.get(INotificationService).info(localize('quantumide.agentTask.aborted', 'Agent task aborted and checkpoints rolled back where possible.'));
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'quantumide.agent.rollbackStep',
				title: localize2('quantumide.agent.rollbackStep', 'QuantumIDE: Rollback Agent Step'),
				category: { value: localize('quantumide.production', 'QuantumIDE Production'), original: 'QuantumIDE Production' },
			});
		}
		override async run(accessor: ServicesAccessor, stepId?: string): Promise<void> {
			if (!stepId) {
				return;
			}
			const r = await accessor.get(IQuantumIDEAgentTaskOrchestratorService).rollbackToStep(stepId);
			if (r.ok) {
				accessor.get(INotificationService).info(localize('quantumide.agentTask.rolledBack', 'Rolled back to step checkpoint.'));
			} else {
				accessor.get(INotificationService).error(r.error ?? localize('quantumide.agentTask.rollbackFailed', 'Rollback failed.'));
			}
		}
	});
}
