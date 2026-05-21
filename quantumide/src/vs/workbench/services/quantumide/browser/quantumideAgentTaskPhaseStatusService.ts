/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { QuantumIDEAISettingId } from '../../../../platform/quantumide/common/quantumideAISettings.js';
import {
	getQuantumIDEAgentTaskPhasePresentation,
	getQuantumIDEAgentTaskPhasePriority,
	type QuantumIDEAgentTaskPhase,
} from '../../../../platform/quantumide/common/quantumideAgentTaskPhase.js';
import {
	IQuantumIDEAgentTaskPhaseStatusService,
	IQuantumIDEAgentTaskPhaseStatusState,
} from '../common/quantumideAgentTaskPhaseStatus.js';

const DEFAULT_DISMISS_MS = 3000;

export class QuantumIDEAgentTaskPhaseStatusService extends Disposable implements IQuantumIDEAgentTaskPhaseStatusService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private _state: IQuantumIDEAgentTaskPhaseStatusState = {
		phase: 'idle',
		presentation: getQuantumIDEAgentTaskPhasePresentation('idle'),
		updatedAt: Date.now(),
		visible: false,
	};

	private _pending: {
		phase: QuantumIDEAgentTaskPhase;
		options?: Parameters<IQuantumIDEAgentTaskPhaseStatusService['setPhase']>[1];
	} | undefined;

	private readonly _flush = this._register(new RunOnceScheduler(() => this._applyPending(), 50));
	private _dismissTimeout: ReturnType<typeof setTimeout> | undefined;

	constructor(
		@IConfigurationService private readonly _config: IConfigurationService,
	) {
		super();
	}

	getState(): IQuantumIDEAgentTaskPhaseStatusState {
		return this._state;
	}

	setPhase(phase: QuantumIDEAgentTaskPhase, options?: {
		message?: string;
		detail?: string;
		sessionId?: string;
		turnId?: string;
		toolName?: string;
		force?: boolean;
	}): void {
		if (this._config.getValue<boolean>(QuantumIDEAISettingId.AgentTaskPhaseStatusEnabled) === false) {
			return;
		}
		if (!options?.force && getQuantumIDEAgentTaskPhasePriority(phase) < getQuantumIDEAgentTaskPhasePriority(this._state.phase)) {
			return;
		}
		this._pending = { phase, options };
		this._flush.schedule();
	}

	clear(dismissMs?: number): void {
		this._pending = undefined;
		this._flush.cancel();
		if (this._dismissTimeout) {
			clearTimeout(this._dismissTimeout);
			this._dismissTimeout = undefined;
		}
		const ms = dismissMs ?? this._config.getValue<number>(QuantumIDEAISettingId.AgentTaskPhaseStatusDismissMs) ?? DEFAULT_DISMISS_MS;
		if (phaseIsTerminal(this._state.phase) && ms > 0) {
			this._dismissTimeout = setTimeout(() => {
				this._dismissTimeout = undefined;
				this._apply('idle', { force: true });
				this._state = { ...this._state, visible: false };
				this._onDidChange.fire();
			}, ms);
		} else {
			this._apply('idle', { force: true });
			this._state = { ...this._state, visible: false };
			this._onDidChange.fire();
		}
	}

	private _applyPending(): void {
		if (!this._pending) {
			return;
		}
		const { phase, options } = this._pending;
		this._pending = undefined;
		this._apply(phase, options);
	}

	private _apply(phase: QuantumIDEAgentTaskPhase, options?: {
		message?: string;
		detail?: string;
		sessionId?: string;
		turnId?: string;
		toolName?: string;
		force?: boolean;
	}): void {
		if (this._dismissTimeout) {
			clearTimeout(this._dismissTimeout);
			this._dismissTimeout = undefined;
		}
		const presentation = getQuantumIDEAgentTaskPhasePresentation(phase, options?.detail, options?.message);
		const visible = phase !== 'idle' || !!options?.message;
		this._state = {
			phase,
			presentation,
			detail: options?.detail,
			sessionId: options?.sessionId,
			turnId: options?.turnId,
			toolName: options?.toolName,
			updatedAt: Date.now(),
			visible,
		};
		this._onDidChange.fire();
		if (phase === 'done' || phase === 'error') {
			const ms = this._config.getValue<number>(QuantumIDEAISettingId.AgentTaskPhaseStatusDismissMs) ?? DEFAULT_DISMISS_MS;
			this._dismissTimeout = setTimeout(() => this.clear(0), ms);
		}
	}
}

function phaseIsTerminal(phase: QuantumIDEAgentTaskPhase): boolean {
	return phase === 'done' || phase === 'error' || phase === 'ready';
}

registerSingleton(IQuantumIDEAgentTaskPhaseStatusService, QuantumIDEAgentTaskPhaseStatusService, InstantiationType.Delayed);
