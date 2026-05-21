/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import {
	IQuantumIDEAgentTaskOrchestratorService,
	IQuantumIDEAgentTaskState,
	IQuantumIDEAgentTaskStep,
	QUANTUMIDE_AGENT_TASK_STORAGE_KEY,
	QuantumIDEAgentStepStatus,
	QuantumIDEAgentTaskStatus,
} from '../common/quantumideAgentTask.js';
import { IQuantumIDEWorkspaceSnapshotService } from '../common/quantumideWorkspaceSnapshot.js';
import { IQuantumIDEChatEditSessionService } from './quantumideChatEditSessionService.js';
import { IQuantumIDEErrorRecoveryService } from '../common/quantumideErrorRecovery.js';

export class QuantumIDEAgentTaskOrchestratorService extends Disposable implements IQuantumIDEAgentTaskOrchestratorService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private _taskId: string | undefined;
	private _title = '';
	private _status: QuantumIDEAgentTaskStatus = 'idle';
	private _planSummary: string | undefined;
	private _steps: IQuantumIDEAgentTaskStep[] = [];
	private _currentStepId: string | undefined;
	private _startedAt: number | undefined;
	private _completedAt: number | undefined;
	private _lastError: string | undefined;
	private _paused = false;
	private _checkpoints = new Map<string, string>();

	constructor(
		@IQuantumIDEWorkspaceSnapshotService private readonly _snapshots: IQuantumIDEWorkspaceSnapshotService,
		@IQuantumIDEChatEditSessionService private readonly _editSession: IQuantumIDEChatEditSessionService,
		@IQuantumIDEErrorRecoveryService private readonly _errors: IQuantumIDEErrorRecoveryService,
		@IStorageService private readonly _storage: IStorageService,
	) {
		super();
		this._restoreFromStorage();
	}

	isPaused(): boolean {
		return this._paused;
	}

	getState(): IQuantumIDEAgentTaskState {
		const total = this._steps.length;
		const done = this._steps.filter(s => s.status === 'completed' || s.status === 'skipped').length;
		const running = this._steps.some(s => s.status === 'running') ? 1 : 0;
		const progressPercent = total === 0 ? 0 : Math.round(((done + (running ? 0.5 : 0)) / total) * 100);
		return {
			taskId: this._taskId,
			title: this._title,
			status: this._status,
			planSummary: this._planSummary,
			steps: [...this._steps],
			currentStepId: this._currentStepId,
			startedAt: this._startedAt,
			completedAt: this._completedAt,
			lastError: this._lastError,
			progressPercent,
		};
	}

	beginTask(title: string, planSteps?: readonly string[], planSummary?: string): string {
		this._taskId = generateUuid();
		this._title = title;
		this._status = planSteps?.length ? 'planning' : 'running';
		this._planSummary = planSummary;
		this._steps = (planSteps ?? []).map((label, i) => this._newStep(label, `step-${i + 1}`));
		this._currentStepId = undefined;
		this._startedAt = Date.now();
		this._completedAt = undefined;
		this._lastError = undefined;
		this._paused = false;
		this._checkpoints.clear();
		if (this._steps.length === 0) {
			this.addStep(localize('quantumide.agentTask.defaultStep', 'Execute agent turn'));
		}
		if (this._status === 'running' && this._steps.length) {
			const first = this._steps.find(s => s.status === 'pending');
			if (first) {
				void this.startStep(first.id);
			}
		}
		this._persist();
		this._onDidChange.fire();
		return this._taskId;
	}

	setPlanSummary(summary: string): void {
		this._planSummary = summary;
		if (this._status === 'planning') {
			this._status = 'running';
		}
		this._persist();
		this._onDidChange.fire();
	}

	addStep(label: string, id?: string): string {
		const step = this._newStep(label, id);
		this._steps = [...this._steps, step];
		this._persist();
		this._onDidChange.fire();
		return step.id;
	}

	async startStep(stepId: string): Promise<void> {
		if (this._paused || this._status === 'cancelled' || this._status === 'idle') {
			return;
		}
		const idx = this._steps.findIndex(s => s.id === stepId);
		if (idx < 0) {
			return;
		}
		try {
			const snap = await this._snapshots.createSnapshot(
				localize('quantumide.agentTask.checkpoint', 'Before step: {0}', this._steps[idx].label),
			);
			this._checkpoints.set(stepId, snap.id);
		} catch {
			// continue without checkpoint
		}
		this._steps = this._steps.map(s => ({
			...s,
			status: s.id === stepId ? 'running' as QuantumIDEAgentStepStatus : (s.status === 'running' ? 'pending' : s.status),
			startedAt: s.id === stepId ? Date.now() : s.startedAt,
		}));
		this._currentStepId = stepId;
		this._status = 'running';
		this._persist();
		this._onDidChange.fire();
	}

	async completeStep(stepId: string, _resultSummary?: string): Promise<void> {
		this._finishStep(stepId, 'completed');
		await this._advanceFrom(stepId);
	}

	async failStep(stepId: string, error: string): Promise<void> {
		this._lastError = error;
		this._finishStep(stepId, 'failed', error);
		this._status = 'failed';
		this._errors.report({
			id: generateUuid(),
			message: localize('quantumide.agentTask.stepFailed', 'Agent step failed.'),
			recoverable: true,
			retryCommand: 'quantumide.agent.rollbackStep',
			retryArgs: [stepId],
		});
		this._persist();
		this._onDidChange.fire();
	}

	pause(): void {
		if (this._status === 'idle' || this._status === 'completed' || this._status === 'cancelled') {
			return;
		}
		this._paused = true;
		this._status = 'paused';
		this._persist();
		this._onDidChange.fire();
	}

	resume(): void {
		if (this._status !== 'paused') {
			return;
		}
		this._paused = false;
		this._status = 'running';
		this._persist();
		this._onDidChange.fire();
	}

	async abort(): Promise<void> {
		const running = this._currentStepId;
		if (running) {
			await this.rollbackToStep(running);
		}
		this._status = 'cancelled';
		this._completedAt = Date.now();
		this._steps = this._steps.map(s =>
			s.status === 'running' || s.status === 'pending'
				? { ...s, status: 'skipped' as QuantumIDEAgentStepStatus, completedAt: Date.now() }
				: s,
		);
		this._currentStepId = undefined;
		this._editSession.rejectAll();
		this._persist();
		this._onDidChange.fire();
	}

	async rollbackToStep(stepId: string): Promise<{ ok: boolean; error?: string }> {
		const snapId = this._checkpoints.get(stepId);
		if (!snapId) {
			return { ok: false, error: localize('quantumide.agentTask.noCheckpoint', 'No checkpoint for this step.') };
		}
		const r = await this._snapshots.restoreSnapshot(snapId, { skipPreBackup: true });
		if (!r.ok) {
			return r;
		}
		this._editSession.rejectAll();
		return { ok: true };
	}

	private async _advanceFrom(stepId: string): Promise<void> {
		const idx = this._steps.findIndex(s => s.id === stepId);
		const next = this._steps.slice(idx + 1).find(s => s.status === 'pending');
		if (next && !this._paused) {
			await this.startStep(next.id);
			return;
		}
		if (!this._steps.some(s => s.status === 'pending' || s.status === 'running')) {
			this._status = 'completed';
			this._completedAt = Date.now();
			this._currentStepId = undefined;
		}
		this._persist();
		this._onDidChange.fire();
	}

	private _finishStep(stepId: string, status: QuantumIDEAgentStepStatus, error?: string): void {
		this._steps = this._steps.map(s =>
			s.id === stepId
				? { ...s, status, completedAt: Date.now(), error, checkpointSnapshotId: this._checkpoints.get(stepId) }
				: s,
		);
		if (this._currentStepId === stepId) {
			this._currentStepId = undefined;
		}
	}

	private _newStep(label: string, id?: string): IQuantumIDEAgentTaskStep {
		return {
			id: id ?? generateUuid(),
			label,
			status: 'pending',
		};
	}

	private _persist(): void {
		try {
			this._storage.store(
				QUANTUMIDE_AGENT_TASK_STORAGE_KEY,
				JSON.stringify(this.getState()),
				StorageScope.WORKSPACE,
				StorageTarget.USER,
			);
		} catch {
			// ignore
		}
	}

	private _restoreFromStorage(): void {
		try {
			const raw = this._storage.get(QUANTUMIDE_AGENT_TASK_STORAGE_KEY, StorageScope.WORKSPACE);
			if (!raw) {
				return;
			}
			const parsed = JSON.parse(raw) as IQuantumIDEAgentTaskState;
			if (parsed.status === 'running' || parsed.status === 'planning') {
				this._taskId = parsed.taskId;
				this._title = parsed.title;
				this._status = 'paused';
				this._planSummary = parsed.planSummary;
				this._steps = [...parsed.steps];
				this._startedAt = parsed.startedAt;
				this._paused = true;
			}
		} catch {
			// ignore
		}
	}
}

registerSingleton(IQuantumIDEAgentTaskOrchestratorService, QuantumIDEAgentTaskOrchestratorService, InstantiationType.Delayed);
