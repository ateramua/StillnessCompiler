/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { FileAccess } from '../../../../base/common/network.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { WebWorkerDescriptor } from '../../../../platform/webWorker/browser/webWorkerDescriptor.js';
import { IWebWorkerService } from '../../../../platform/webWorker/browser/webWorkerService.js';
import { logOnceWebWorkerWarning } from '../../../../base/common/worker/webWorker.js';
import { applyQuantumIDESemanticIncrementalCore } from '../../../../platform/quantumide/common/quantumideSemanticIncrementalCore.js';
import { recordQuantumIDEIndexingMainThreadSlice } from '../../../../platform/quantumide/common/quantumideMainThreadLongTask.js';
import type {
	IQuantumIDEIndexerCpuWorker,
	IQuantumIDEIndexerCpuWorkerArgs,
	IQuantumIDEIndexerCpuWorkerResult,
} from '../../../../platform/quantumide/common/quantumideIndexerCpuWorkerTypes.js';

export interface IQuantumIDEIndexerCpuWorkerService {
	readonly _serviceBrand: undefined;
	applyIncrementalCore(args: IQuantumIDEIndexerCpuWorkerArgs): Promise<IQuantumIDEIndexerCpuWorkerResult>;
}

export const IQuantumIDEIndexerCpuWorkerService = createDecorator<IQuantumIDEIndexerCpuWorkerService>('quantumIDEIndexerCpuWorkerService');

export class QuantumIDEIndexerCpuWorkerService extends Disposable implements IQuantumIDEIndexerCpuWorkerService {
	declare readonly _serviceBrand: undefined;

	private _worker: import('../../../../base/common/worker/webWorker.js').IWebWorkerClient<IQuantumIDEIndexerCpuWorker> | undefined;

	constructor(
		@IWebWorkerService private readonly _webWorkerService: IWebWorkerService,
	) {
		super();
	}

	async applyIncrementalCore(args: IQuantumIDEIndexerCpuWorkerArgs): Promise<IQuantumIDEIndexerCpuWorkerResult> {
		try {
			const worker = this._getOrCreateWorker();
			return await worker.proxy.$applyIncrementalCore(args);
		} catch {
			const start = performance.now();
			const result = applyQuantumIDESemanticIncrementalCore(args);
			recordQuantumIDEIndexingMainThreadSlice(performance.now() - start);
			return result;
		}
	}

	private _getOrCreateWorker(): import('../../../../base/common/worker/webWorker.js').IWebWorkerClient<IQuantumIDEIndexerCpuWorker> {
		if (!this._worker) {
			try {
				this._worker = this._register(this._webWorkerService.createWorkerClient<IQuantumIDEIndexerCpuWorker>(
					new WebWorkerDescriptor({
						esmModuleLocation: FileAccess.asBrowserUri('vs/workbench/services/quantumide/browser/worker/quantumideIndexerCpu.workerMain.js'),
						label: 'QuantumIDEIndexerCpuWorker',
					}),
				));
			} catch (err) {
				logOnceWebWorkerWarning(err);
				throw err;
			}
		}
		return this._worker;
	}
}

registerSingleton(IQuantumIDEIndexerCpuWorkerService, QuantumIDEIndexerCpuWorkerService, InstantiationType.Delayed);
