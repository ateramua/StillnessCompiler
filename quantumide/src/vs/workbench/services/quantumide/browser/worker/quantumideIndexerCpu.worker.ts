/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import type { IWebWorkerServerRequestHandler, IWebWorkerServer } from '../../../../../base/common/worker/webWorker.js';
import { applyQuantumIDESemanticIncrementalCore } from '../../../../../platform/quantumide/common/quantumideSemanticIncrementalCore.js';
import type { IQuantumIDEIndexerCpuWorker, IQuantumIDEIndexerCpuWorkerArgs, IQuantumIDEIndexerCpuWorkerResult } from '../../../../../platform/quantumide/common/quantumideIndexerCpuWorkerTypes.js';

export function create(workerServer: IWebWorkerServer): IWebWorkerServerRequestHandler {
	return new QuantumIDEIndexerCpuWorker(workerServer);
}

class QuantumIDEIndexerCpuWorker implements IQuantumIDEIndexerCpuWorker, IWebWorkerServerRequestHandler {
	_requestHandlerBrand: undefined;

	constructor(_workerServer: IWebWorkerServer) {
	}

	async $applyIncrementalCore(args: IQuantumIDEIndexerCpuWorkerArgs): Promise<IQuantumIDEIndexerCpuWorkerResult> {
		return applyQuantumIDESemanticIncrementalCore(args);
	}
}
