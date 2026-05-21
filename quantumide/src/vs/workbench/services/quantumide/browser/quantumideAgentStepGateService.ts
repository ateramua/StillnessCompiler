/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { QuantumIDEAISettingId } from '../../../../platform/quantumide/common/quantumideAISettings.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { writeQuantumIDEAgentPauseState } from '../../../../platform/quantumide/common/quantumideAgentPauseStore.js';
import {
	IQuantumIDEAgentStepGateService,
	QUANTUMIDE_DANGEROUS_TOOL_IDS,
} from '../common/quantumideAgentStepGate.js';
import { IQuantumIDEAgentTaskOrchestratorService } from '../common/quantumideAgentTask.js';

export class QuantumIDEAgentStepGateService extends Disposable implements IQuantumIDEAgentStepGateService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private _stepMode = false;
	private _waiters: (() => void)[] = [];

	constructor(
		@IQuantumIDEAgentTaskOrchestratorService private readonly _tasks: IQuantumIDEAgentTaskOrchestratorService,
		@IConfigurationService private readonly _configuration: IConfigurationService,
		@IFileService private readonly _fileService: IFileService,
		@IWorkspaceContextService private readonly _workspace: IWorkspaceContextService,
	) {
		super();
		this._register(this._tasks.onDidChange(() => {
			void this._syncHostPause();
			this._onDidChange.fire();
		}));
	}

	private _workspaceRoot() {
		return this._workspace.getWorkspace().folders[0]?.uri;
	}

	private async _syncHostPause(): Promise<void> {
		const paused = this.isPaused() || this._stepMode;
		await writeQuantumIDEAgentPauseState(this._fileService, this._workspaceRoot(), {
			paused,
			stepMode: this._stepMode,
			updatedAt: Date.now(),
		});
	}

	isPaused(): boolean {
		return this._tasks.isPaused() || this._tasks.getState().status === 'paused';
	}

	isStepMode(): boolean {
		return this._stepMode;
	}

	pause(): void {
		this._tasks.pause();
		void this._syncHostPause();
		this._onDidChange.fire();
	}

	resume(): void {
		this._tasks.resume();
		this._flushWaiters();
		void this._syncHostPause();
		this._onDidChange.fire();
	}

	enableStepMode(enabled: boolean): void {
		this._stepMode = enabled;
		if (enabled) {
			this._tasks.pause();
		}
		void this._syncHostPause();
		this._onDidChange.fire();
	}

	async awaitGate(toolId: string): Promise<void> {
		const gateAll = this._configuration.getValue<boolean>('quantumide.agent.pauseBeforeNextTool') === true;
		const requireConfirm = this._configuration.getValue<boolean>(QuantumIDEAISettingId.AgentRequireConfirmationForTerminal) !== false;
		const dangerous = QUANTUMIDE_DANGEROUS_TOOL_IDS.has(toolId);
		if (!this.isPaused() && !this._stepMode && !(gateAll || (requireConfirm && dangerous))) {
			return;
		}
		if (!this.isPaused() && !this._stepMode) {
			return;
		}
		await new Promise<void>(resolve => this._waiters.push(resolve));
	}

	notifyToolCompleted(_toolId: string): void {
		if (this._stepMode) {
			this._tasks.pause();
			void this._syncHostPause();
		}
	}

	private _flushWaiters(): void {
		const w = this._waiters.splice(0);
		for (const resolve of w) {
			resolve();
		}
	}
}

registerSingleton(IQuantumIDEAgentStepGateService, QuantumIDEAgentStepGateService, InstantiationType.Delayed);
