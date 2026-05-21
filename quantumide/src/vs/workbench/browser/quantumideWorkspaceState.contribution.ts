/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../base/common/async.js';
import { Disposable } from '../../base/common/lifecycle.js';
import { isQuantumIDEProduct } from '../../platform/quantumide/common/quantumideChatPlatform.js';
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from '../common/contributions.js';
import product from '../../platform/product/common/product.js';
import { IEditorService } from '../services/editor/common/editorService.js';
import { IWorkbenchLayoutService } from '../services/layout/browser/layoutService.js';
import { ITextFileService } from '../services/textfile/common/textfiles.js';
import { IWorkspaceContextService, WorkbenchState } from '../../platform/workspace/common/workspace.js';
import { IConfigurationService } from '../../platform/configuration/common/configuration.js';
import { QuantumIDEAISettingId } from '../../platform/quantumide/common/quantumideAISettings.js';
import { IQuantumIDEWorkspaceStateService } from '../services/quantumide/common/quantumideWorkspaceState.js';
import { IQuantumIDEChatEditSessionService } from '../services/quantumide/browser/quantumideChatEditSessionService.js';
import { IQuantumIDEChatThreadStoreService } from '../services/quantumide/common/quantumideChatThreadStore.js';

function isQuantumIDE(): boolean {
	return isQuantumIDEProduct(product.applicationName)
		|| [product.nameShort, product.nameLong].some(n => typeof n === 'string' && n.toLowerCase().includes('quantumide'));
}

/** Defer session restore so .code-workspace / multi-root opens can paint the workbench first. */
const WORKSPACE_RESTORE_DELAY_MS = 4000;

class QuantumIDEWorkspaceStateContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.quantumideWorkspaceState';

	private _didScheduleRestore = false;

	constructor(
		@IConfigurationService private readonly _configuration: IConfigurationService,
		@IQuantumIDEWorkspaceStateService private readonly _workspaceState: IQuantumIDEWorkspaceStateService,
		@IWorkspaceContextService private readonly _workspace: IWorkspaceContextService,
		@IEditorService private readonly _editorService: IEditorService,
		@IWorkbenchLayoutService private readonly _layout: IWorkbenchLayoutService,
		@ITextFileService private readonly _textFiles: ITextFileService,
		@IQuantumIDEChatEditSessionService private readonly _chatEdits: IQuantumIDEChatEditSessionService,
		@IQuantumIDEChatThreadStoreService private readonly _threads: IQuantumIDEChatThreadStoreService,
	) {
		super();
		if (!isQuantumIDE()) {
			return;
		}

		const schedule = () => this._workspaceState.scheduleAutoSave();
		this._register(this._editorService.onDidActiveEditorChange(schedule));
		this._register(this._editorService.onDidCloseEditor(schedule));
		this._register(this._editorService.onDidVisibleEditorsChange(schedule));
		this._register(this._layout.onDidChangePartVisibility(schedule));
		this._register(this._layout.onDidChangePanelPosition(schedule));
		this._register(this._layout.onDidChangePanelAlignment(schedule));
		this._register(this._textFiles.files.onDidChangeDirty(schedule));
		this._register(this._chatEdits.onDidChange(schedule));
		this._register(this._threads.onDidChange(schedule));

		const restoreScheduler = this._register(new RunOnceScheduler(() => void this._runDeferredRestore(), WORKSPACE_RESTORE_DELAY_MS));

		const scheduleRestore = () => {
			if (this._workspace.getWorkbenchState() === WorkbenchState.EMPTY) {
				return;
			}
			void this._scheduleRestore(restoreScheduler);
		};

		this._register(this._workspace.onDidChangeWorkbenchState(scheduleRestore));
		if (this._workspace.getWorkbenchState() !== WorkbenchState.EMPTY) {
			void this._scheduleRestore(restoreScheduler);
		}
	}

	private async _scheduleRestore(restoreScheduler: RunOnceScheduler): Promise<void> {
		if (this._didScheduleRestore) {
			return;
		}
		if (this._configuration.getValue<boolean>(QuantumIDEAISettingId.WorkspaceAutoRestoreSession) !== true) {
			return;
		}
		if (!this._workspaceState.getLastSavedMeta()) {
			return;
		}
		this._didScheduleRestore = true;
		await this._layout.whenRestored;
		restoreScheduler.schedule();
	}

	private async _runDeferredRestore(): Promise<void> {
		if (this._workspace.getWorkbenchState() === WorkbenchState.EMPTY) {
			return;
		}
		const result = await this._workspaceState.restoreLastState();
		if (!result.ok && result.error && !/ENOENT|not found|Unable to resolve/i.test(result.error)) {
			// first session or deleted state file
		}
	}
}

if (isQuantumIDE()) {
	registerWorkbenchContribution2(QuantumIDEWorkspaceStateContribution.ID, QuantumIDEWorkspaceStateContribution, WorkbenchPhase.AfterRestored);
}
