/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IQuantumIDESemanticIndexService } from '../common/quantumideSemanticIndex.js';

/** Off-main-thread style indexer: yields between per-file and full refresh passes. */
export interface IQuantumIDEIndexerWorkerScheduler {
	readonly _serviceBrand: undefined;
	/** Queue a single-file incremental index pass (M-29). */
	scheduleIncrementalFile(resource: URI): void;
	scheduleChunkedRefresh(reason: string): void;
	isWorkerBusy(): boolean;
}

export const IQuantumIDEIndexerWorkerScheduler = createDecorator<IQuantumIDEIndexerWorkerScheduler>('quantumIDEIndexerWorkerScheduler');

export class QuantumIDEIndexerWorkerScheduler extends Disposable implements IQuantumIDEIndexerWorkerScheduler {
	declare readonly _serviceBrand: undefined;

	private _processing = false;
	private _fullRefreshPending = false;
	private _fullRefreshReason = 'indexer-worker';
	private readonly _pendingFiles = new Map<string, URI>();
	private readonly _workerScheduler = this._register(new RunOnceScheduler(() => void this._runWorker(), 50));

	constructor(
		@IQuantumIDESemanticIndexService private readonly _semanticIndex: IQuantumIDESemanticIndexService,
	) {
		super();
	}

	scheduleIncrementalFile(resource: URI): void {
		this._pendingFiles.set(resource.toString(), resource);
		this._workerScheduler.schedule();
	}

	scheduleChunkedRefresh(reason: string): void {
		this._fullRefreshReason = reason;
		this._fullRefreshPending = true;
		this._workerScheduler.schedule();
	}

	isWorkerBusy(): boolean {
		return this._processing;
	}

	private async _runWorker(): Promise<void> {
		if (this._processing) {
			this._workerScheduler.schedule();
			return;
		}
		this._processing = true;
		try {
			while (this._pendingFiles.size > 0) {
				const resource = this._pendingFiles.values().next().value as URI;
				this._pendingFiles.delete(resource.toString());
				await new Promise<void>(resolve => setTimeout(resolve, 0));
				await this._semanticIndex.incrementalUpdateFile(resource);
			}
			if (this._fullRefreshPending) {
				this._fullRefreshPending = false;
				await new Promise<void>(resolve => setTimeout(resolve, 16));
				await this._semanticIndex.refreshIndexes(this._fullRefreshReason);
			}
		} finally {
			this._processing = false;
			if (this._pendingFiles.size > 0 || this._fullRefreshPending) {
				this._workerScheduler.schedule();
			}
		}
	}
}

registerSingleton(IQuantumIDEIndexerWorkerScheduler, QuantumIDEIndexerWorkerScheduler, InstantiationType.Delayed);
