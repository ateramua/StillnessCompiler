/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { parseQuantumIDETestOutput } from '../../../../platform/quantumide/common/quantumideTestResultParser.js';
import { IQuantumIDEChatInThreadInjectService } from '../common/quantumideChatInThreadInject.js';
import { IQuantumIDETerminalBlockService } from '../common/quantumideTerminalBlock.js';

export class QuantumIDETerminalBlockService implements IQuantumIDETerminalBlockService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IQuantumIDEChatInThreadInjectService private readonly _inject: IQuantumIDEChatInThreadInjectService,
	) { }

	recordTerminalRun(command: string, exitCode: number, output: string): void {
		this._inject.injectTerminalBlock(command, exitCode, output);
	}

	recordTestOutput(output: string): void {
		const parsed = parseQuantumIDETestOutput(output);
		this._inject.injectTestResults(parsed.summary, parsed.passed, parsed.failed, parsed.detail);
	}
}

registerSingleton(IQuantumIDETerminalBlockService, QuantumIDETerminalBlockService, InstantiationType.Delayed);
