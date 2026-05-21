/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

/** QPR-1.4.001 — single normalized edit proposal surface for chat, tools, and agent host. */
export interface IQuantumIDEEditProposal {
	readonly path: string;
	readonly content: string;
	readonly resourceUri?: string;
}

export interface IQuantumIDEUnifiedEditPipelineService {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<void>;
	getPendingCount(): number;
	proposeEdits(edits: readonly IQuantumIDEEditProposal[], label?: string, options?: { openMultiDiff?: boolean }): Promise<void>;
	acceptAll(): Promise<{ applied: number; errors: string[] }>;
	rejectAll(): void;
	acceptById(id: string): Promise<boolean>;
	rejectById(id: string): void;
}

export const IQuantumIDEUnifiedEditPipelineService = createDecorator<IQuantumIDEUnifiedEditPipelineService>('quantumIDEUnifiedEditPipelineService');
