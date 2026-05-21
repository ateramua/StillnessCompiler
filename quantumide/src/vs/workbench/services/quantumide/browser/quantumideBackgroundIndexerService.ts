/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { QuantumIDEAISettingId } from '../../../../platform/quantumide/common/quantumideAISettings.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment } from '../../../services/statusbar/browser/statusbar.js';
import { IQuantumIDESemanticIndexService } from '../common/quantumideSemanticIndex.js';
import { IQuantumIDEIndexerWorkerScheduler } from './quantumideIndexerWorkerScheduler.js';
import { ITextFileService } from '../../textfile/common/textfiles.js';

export interface IQuantumIDEBackgroundIndexerService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeProgress: import('../../../../base/common/event.js').Event<{ phase: string; busy: boolean; percent?: number; indexedFiles?: number }>;
	scheduleBackgroundRefresh(reason: string): void;
	isIndexing(): boolean;
	getProgress(): { busy: boolean; percent?: number; indexedFiles: number };
}

export const IQuantumIDEBackgroundIndexerService = createDecorator<IQuantumIDEBackgroundIndexerService>('quantumIDEBackgroundIndexerService');

export class QuantumIDEBackgroundIndexerService extends Disposable implements IQuantumIDEBackgroundIndexerService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeProgress = this._register(new Emitter<{ phase: string; busy: boolean; percent?: number; indexedFiles?: number }>());
	readonly onDidChangeProgress = this._onDidChangeProgress.event;

	private readonly _statusEntry = this._register(new MutableDisposable<IStatusbarEntryAccessor>());
	private _busy = false;
	private readonly _scheduler = this._register(new RunOnceScheduler(() => void this._runIndex(), 1500));

	constructor(
		@IQuantumIDESemanticIndexService private readonly _semanticIndex: IQuantumIDESemanticIndexService,
		@IQuantumIDEIndexerWorkerScheduler private readonly _indexerWorker: IQuantumIDEIndexerWorkerScheduler,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IWorkspaceContextService private readonly _workspace: IWorkspaceContextService,
		@IFileService private readonly _fileService: IFileService,
		@IStatusbarService private readonly _statusbar: IStatusbarService,
		@ITextFileService private readonly _textFiles: ITextFileService,
	) {
		super();
		const dirtyScheduler = this._register(new RunOnceScheduler(() => this.scheduleBackgroundRefresh('unsaved buffer edit'), 800));
		this._register(this._textFiles.files.onDidChangeDirty(() => dirtyScheduler.schedule()));
		this._register(this._workspace.onDidChangeWorkspaceFolders(() => this.scheduleBackgroundRefresh('workspace folders changed')));
		this._register(this._fileService.onDidFilesChange(e => {
			if (e.rawAdded.length > 0 || e.rawUpdated.length > 0 || e.rawDeleted.length > 0) {
				this.scheduleBackgroundRefresh('workspace files changed');
			}
		}));
		if (this._configurationService.getValue<boolean>(QuantumIDEAISettingId.SemanticIndexingEnabled) === true) {
			this._register(new RunOnceScheduler(() => this.scheduleBackgroundRefresh('startup'), 10_000)).schedule();
		}
	}

	scheduleBackgroundRefresh(reason: string): void {
		if (this._configurationService.getValue<boolean>(QuantumIDEAISettingId.SemanticIndexingEnabled) === false) {
			return;
		}
		void reason;
		this._scheduler.schedule();
	}

	isIndexing(): boolean {
		return this._busy;
	}

	getProgress(): { busy: boolean; percent?: number; indexedFiles: number } {
		const limits = this._semanticIndex.getIndexStats();
		const max = this._configurationService.getValue<number>(QuantumIDEAISettingId.IndexingMaxFiles)
			?? (this._configurationService.getValue<string>(QuantumIDEAISettingId.IndexingScaleProfile) === 'enterprise' ? 50_000 : 500);
		const percent = max > 0 ? Math.min(100, Math.round((limits.indexedFiles / max) * 100)) : undefined;
		return { busy: this._busy, percent: this._busy ? percent : (percent === 100 ? 100 : percent), indexedFiles: limits.indexedFiles };
	}

	private async _runIndex(): Promise<void> {
		if (this._busy || !this._workspace.getWorkspace().folders.length) {
			return;
		}
		this._busy = true;
		const progress = this.getProgress();
		this._onDidChangeProgress.fire({ phase: 'indexing', busy: true, percent: progress.percent, indexedFiles: progress.indexedFiles });
		this._statusEntry.value = this._statusbar.addEntry({
			name: localize('quantumide.indexingStatus', 'QuantumIDE indexing'),
			text: progress.percent !== undefined
				? '$(sync~spin) ' + localize('quantumide.indexingPercent', 'Indexing {0}% ({1} files)', progress.percent, progress.indexedFiles)
				: '$(sync~spin) ' + localize('quantumide.indexing', 'Indexing…'),
			ariaLabel: localize('quantumide.indexingAria', 'QuantumIDE is indexing the workspace'),
			showInAllWindows: true,
		}, 'quantumide.backgroundIndexer', StatusbarAlignment.LEFT, 100);
		try {
			this._indexerWorker.scheduleChunkedRefresh('background');
			await new Promise<void>(resolve => {
				const check = () => {
					if (!this._indexerWorker.isWorkerBusy()) {
						resolve();
						return;
					}
					setTimeout(check, 100);
				};
				check();
			});
			void this._semanticIndex.getIndexStats();
		} finally {
			this._busy = false;
			this._statusEntry.clear();
			const done = this.getProgress();
			this._onDidChangeProgress.fire({ phase: 'idle', busy: false, percent: 100, indexedFiles: done.indexedFiles });
		}
	}
}

registerSingleton(IQuantumIDEBackgroundIndexerService, QuantumIDEBackgroundIndexerService, InstantiationType.Delayed);
