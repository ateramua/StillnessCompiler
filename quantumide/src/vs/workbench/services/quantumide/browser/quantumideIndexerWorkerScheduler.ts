/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IQuantumIDESemanticIndexService } from '../common/quantumideSemanticIndex.js';

/** Off-main-thread style indexer: yields between chunk passes on a dedicated scheduler. */
export interface IQuantumIDEIndexerWorkerScheduler {
	readonly _serviceBrand: undefined;
	scheduleChunkedRefresh(reason: string): void;
	isWorkerBusy(): boolean;
}

export const IQuantumIDEIndexerWorkerScheduler = createDecorator<IQuantumIDEIndexerWorkerScheduler>('quantumIDEIndexerWorkerScheduler');

export class QuantumIDEIndexerWorkerScheduler extends Disposable implements IQuantumIDEIndexerWorkerScheduler {
	declare readonly _serviceBrand: undefined;

	private _busy = false;
	private readonly _scheduler = this._register(new RunOnceScheduler(() => void this._run(), 400));

	constructor(
		@IQuantumIDESemanticIndexService private readonly _semanticIndex: IQuantumIDESemanticIndexService,
	) {
		super();
	}

	scheduleChunkedRefresh(reason: string): void {
		void reason;
		this._scheduler.schedule();
	}

	isWorkerBusy(): boolean {
		return this._busy;
	}

	private async _run(): Promise<void> {
		if (this._busy) {
			return;
		}
		this._busy = true;
		try {
			// Yield to UI thread before heavy index pass (dedicated scheduler lane).
			await new Promise<void>(resolve => setTimeout(resolve, 16));
			await this._semanticIndex.refreshIndexes('indexer-worker');
		} finally {
			this._busy = false;
		}
	}
}

registerSingleton(IQuantumIDEIndexerWorkerScheduler, QuantumIDEIndexerWorkerScheduler, InstantiationType.Delayed);
