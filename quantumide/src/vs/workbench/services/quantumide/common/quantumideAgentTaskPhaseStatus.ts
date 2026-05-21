/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import type { QuantumIDEAgentTaskPhase } from '../../../../platform/quantumide/common/quantumideAgentTaskPhase.js';
import type { IQuantumIDEAgentTaskPhasePresentation } from '../../../../platform/quantumide/common/quantumideAgentTaskPhase.js';

export interface IQuantumIDEAgentTaskPhaseStatusState {
	readonly phase: QuantumIDEAgentTaskPhase;
	readonly presentation: IQuantumIDEAgentTaskPhasePresentation;
	readonly detail?: string;
	readonly sessionId?: string;
	readonly turnId?: string;
	readonly toolName?: string;
	readonly updatedAt: number;
	readonly visible: boolean;
}

export interface IQuantumIDEAgentTaskPhaseStatusService {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<void>;
	getState(): IQuantumIDEAgentTaskPhaseStatusState;
	setPhase(phase: QuantumIDEAgentTaskPhase, options?: {
		message?: string;
		detail?: string;
		sessionId?: string;
		turnId?: string;
		toolName?: string;
		force?: boolean;
	}): void;
	clear(dismissMs?: number): void;
}

export const IQuantumIDEAgentTaskPhaseStatusService = createDecorator<IQuantumIDEAgentTaskPhaseStatusService>('quantumIDEAgentTaskPhaseStatusService');
