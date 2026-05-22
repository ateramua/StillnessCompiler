/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { QUANTUMIDE_INDEXER_WORKER_SLICE_YIELD_MS } from '../../../../platform/quantumide/common/quantumideIndexingMainThreadIsolation.js';
import {
	beginQuantumIDEIndexingMainThreadSession,
	endQuantumIDEIndexingMainThreadSession,
} from '../../../../platform/quantumide/common/quantumideMainThreadLongTask.js';
import { IQuantumIDESemanticIndexService } from '../common/quantumideSemanticIndex.js';

export type QuantumIDEIndexerFilePriority = 'active' | 'normal';

/** Off-main-thread style indexer: yields between per-file and full refresh passes. */
export interface IQuantumIDEIndexerWorkerScheduler {
	readonly _serviceBrand: undefined;
	/** Queue a single-file incremental index pass (M-29). */
	scheduleIncrementalFile(resource: URI, priority?: QuantumIDEIndexerFilePriority): void;
	scheduleChunkedRefresh(reason: string): void;
	isWorkerBusy(): boolean;
}

export const IQuantumIDEIndexerWorkerScheduler = createDecorator<IQuantumIDEIndexerWorkerScheduler>('quantumIDEIndexerWorkerScheduler');

/** AC-01-04: active editor switch — run incremental ASAP. */
const ACTIVE_INCREMENTAL_DEBOUNCE_MS = 0;
/** AC-01-06: yield between files so main-thread slices stay short. */
const NORMAL_INCREMENTAL_DEBOUNCE_MS = QUANTUMIDE_INDEXER_WORKER_SLICE_YIELD_MS;

export class QuantumIDEIndexerWorkerScheduler extends Disposable implements IQuantumIDEIndexerWorkerScheduler {
	declare readonly _serviceBrand: undefined;

	private _processing = false;
	private _fullRefreshPending = false;
	private _fullRefreshReason = 'indexer-worker';
	private readonly _pendingActive = new Map<string, URI>();
	private readonly _pendingNormal = new Map<string, URI>();
	private readonly _activeScheduler = this._register(new RunOnceScheduler(() => void this._runWorker(), ACTIVE_INCREMENTAL_DEBOUNCE_MS));
	private readonly _normalScheduler = this._register(new RunOnceScheduler(() => void this._runWorker(), NORMAL_INCREMENTAL_DEBOUNCE_MS));

	constructor(
		@IQuantumIDESemanticIndexService private readonly _semanticIndex: IQuantumIDESemanticIndexService,
	) {
		super();
	}

	scheduleIncrementalFile(resource: URI, priority: QuantumIDEIndexerFilePriority = 'normal'): void {
		const key = resource.toString();
		if (priority === 'active') {
			this._pendingActive.set(key, resource);
			this._pendingNormal.delete(key);
			this._activeScheduler.schedule();
			return;
		}
		if (!this._pendingActive.has(key)) {
			this._pendingNormal.set(key, resource);
		}
		this._normalScheduler.schedule();
	}

	scheduleChunkedRefresh(reason: string): void {
		this._fullRefreshReason = reason;
		this._fullRefreshPending = true;
		this._activeScheduler.schedule();
		this._normalScheduler.schedule();
	}

	isWorkerBusy(): boolean {
		return this._processing;
	}

	private async _runWorker(): Promise<void> {
		if (this._processing) {
			this._activeScheduler.schedule();
			this._normalScheduler.schedule();
			return;
		}
		this._processing = true;
		beginQuantumIDEIndexingMainThreadSession();
		try {
			while (this._pendingActive.size > 0 || this._pendingNormal.size > 0) {
				const resource = this._dequeueNext();
				if (!resource) {
					break;
				}
				await new Promise<void>(resolve => setTimeout(resolve, QUANTUMIDE_INDEXER_WORKER_SLICE_YIELD_MS));
				await this._semanticIndex.incrementalUpdateFile(resource);
			}
			if (this._fullRefreshPending) {
				this._fullRefreshPending = false;
				await new Promise<void>(resolve => setTimeout(resolve, 16));
				await this._semanticIndex.refreshIndexes(this._fullRefreshReason);
			}
		} finally {
			endQuantumIDEIndexingMainThreadSession();
			this._processing = false;
			if (this._pendingActive.size > 0 || this._pendingNormal.size > 0 || this._fullRefreshPending) {
				this._activeScheduler.schedule();
				this._normalScheduler.schedule();
			}
		}
	}

	private _dequeueNext(): URI | undefined {
		const active = this._pendingActive.values().next().value as URI | undefined;
		if (active) {
			this._pendingActive.delete(active.toString());
			return active;
		}
		const normal = this._pendingNormal.values().next().value as URI | undefined;
		if (normal) {
			this._pendingNormal.delete(normal.toString());
			return normal;
		}
		return undefined;
	}
}

registerSingleton(IQuantumIDEIndexerWorkerScheduler, QuantumIDEIndexerWorkerScheduler, InstantiationType.Delayed);
