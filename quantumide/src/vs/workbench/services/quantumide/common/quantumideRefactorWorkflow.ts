/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export interface IQuantumIDERefactorAction {
	readonly id: string;
	readonly label: string;
	readonly description: string;
	readonly command: string;
	readonly previewCommand?: string;
	readonly requiresSelection?: boolean;
}

export interface IQuantumIDERefactorWorkflowService {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<void>;
	getAvailableRefactors(hasSelection: boolean, hasActiveEditor: boolean): readonly IQuantumIDERefactorAction[];
	getRefactorHistory(): readonly { id: string; label: string; at: number }[];
	recordRefactorRun(id: string, label: string): void;
}

export const IQuantumIDERefactorWorkflowService = createDecorator<IQuantumIDERefactorWorkflowService>('quantumIDERefactorWorkflowService');

export const QUANTUMIDE_REFACTOR_HISTORY_KEY = 'quantumide.chat.refactorHistory';
