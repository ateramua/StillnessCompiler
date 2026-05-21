/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export interface IQuantumIDETerminalBlockService {
	readonly _serviceBrand: undefined;
	recordTerminalRun(command: string, exitCode: number, output: string): void;
	recordTestOutput(output: string): void;
}

export const IQuantumIDETerminalBlockService = createDecorator<IQuantumIDETerminalBlockService>('quantumIDETerminalBlockService');
