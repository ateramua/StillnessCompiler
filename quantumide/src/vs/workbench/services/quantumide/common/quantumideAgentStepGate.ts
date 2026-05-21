/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

/** QPR-3.1.002 — workbench pause before next tool / terminal batch. */
export interface IQuantumIDEAgentStepGateService {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<void>;
	isPaused(): boolean;
	isStepMode(): boolean;
	pause(): void;
	resume(): void;
	enableStepMode(enabled: boolean): void;
	/** Blocks until resumed when paused; no-op when idle. */
	awaitGate(toolId: string): Promise<void>;
	/** After one tool, re-pause when step mode is on. */
	notifyToolCompleted(toolId: string): void;
}

export const IQuantumIDEAgentStepGateService = createDecorator<IQuantumIDEAgentStepGateService>('quantumIDEAgentStepGateService');

export const QUANTUMIDE_DANGEROUS_TOOL_IDS = new Set([
	'run_terminal_cmd',
	'run_workspace_check',
	'apply_workspace_edits',
	'propose_file_edit',
	'quantumide_stage_chat_edits',
]);
