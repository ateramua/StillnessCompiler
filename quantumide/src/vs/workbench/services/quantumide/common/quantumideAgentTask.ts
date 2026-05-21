/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export type QuantumIDEAgentTaskStatus = 'idle' | 'planning' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
export type QuantumIDEAgentStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface IQuantumIDEAgentTaskStep {
	readonly id: string;
	readonly label: string;
	readonly status: QuantumIDEAgentStepStatus;
	readonly startedAt?: number;
	readonly completedAt?: number;
	readonly error?: string;
	readonly checkpointSnapshotId?: string;
}

export interface IQuantumIDEAgentTaskState {
	readonly taskId?: string;
	readonly title: string;
	readonly status: QuantumIDEAgentTaskStatus;
	readonly planSummary?: string;
	readonly steps: readonly IQuantumIDEAgentTaskStep[];
	readonly currentStepId?: string;
	readonly startedAt?: number;
	readonly completedAt?: number;
	readonly lastError?: string;
	readonly progressPercent: number;
}

export interface IQuantumIDEAgentTaskOrchestratorService {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<void>;
	getState(): IQuantumIDEAgentTaskState;
	isPaused(): boolean;
	beginTask(title: string, planSteps?: readonly string[], planSummary?: string): string;
	setPlanSummary(summary: string): void;
	addStep(label: string, id?: string): string;
	startStep(stepId: string): Promise<void>;
	completeStep(stepId: string, resultSummary?: string): Promise<void>;
	failStep(stepId: string, error: string): Promise<void>;
	pause(): void;
	resume(): void;
	abort(): Promise<void>;
	rollbackToStep(stepId: string): Promise<{ ok: boolean; error?: string }>;
}

export const IQuantumIDEAgentTaskOrchestratorService = createDecorator<IQuantumIDEAgentTaskOrchestratorService>('quantumIDEAgentTaskOrchestratorService');

export const QUANTUMIDE_AGENT_TASK_STORAGE_KEY = 'quantumide.agentTask.last';
