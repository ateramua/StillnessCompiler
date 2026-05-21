/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export interface IQuantumIDEErrorReport {
	readonly id: string;
	readonly message: string;
	readonly recoverable: boolean;
	readonly retryCommand?: string;
	readonly retryArgs?: readonly unknown[];
}

export interface IQuantumIDEErrorRecoveryService {
	readonly _serviceBrand: undefined;
	readonly onDidReport: Event<IQuantumIDEErrorReport>;
	report(report: IQuantumIDEErrorReport): void;
	getRecent(): readonly IQuantumIDEErrorReport[];
	clear(id: string): void;
}

export const IQuantumIDEErrorRecoveryService = createDecorator<IQuantumIDEErrorRecoveryService>('quantumIDEErrorRecoveryService');
