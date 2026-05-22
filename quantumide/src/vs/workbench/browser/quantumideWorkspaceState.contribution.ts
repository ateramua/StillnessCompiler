/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../base/common/async.js';
import { Disposable } from '../../base/common/lifecycle.js';
import { isQuantumIDEProduct } from '../../platform/quantumide/common/quantumideChatPlatform.js';
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from '../common/contributions.js';
import product from '../../platform/product/common/product.js';
import { IWorkbenchLayoutService } from '../services/layout/browser/layoutService.js';
import { IWorkspaceContextService, WorkbenchState } from '../../platform/workspace/common/workspace.js';
import { IConfigurationService } from '../../platform/configuration/common/configuration.js';
import { QuantumIDEAISettingId } from '../../platform/quantumide/common/quantumideAISettings.js';
import { IQuantumIDEWorkspaceStateService } from '../services/quantumide/common/quantumideWorkspaceState.js';

function isQuantumIDE(): boolean {
	return isQuantumIDEProduct(product.applicationName)
		|| [product.nameShort, product.nameLong].some(n => typeof n === 'string' && n.toLowerCase().includes('quantumide'));
}

/** Defer session restore so .code-workspace / multi-root opens can paint the workbench first. */
const WORKSPACE_RESTORE_DELAY_MS = 4000;

/**
 * Session restore only. Session *save* is manual (QuantumIDE: Save Workspace Session) unless
 * `quantumide.workspace.autoSaveSession` is enabled — we do not hook editor/chat events so agent
 * turns do not trigger persist storms.
 */
class QuantumIDEWorkspaceStateContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.quantumideWorkspaceState';

	private _didScheduleRestore = false;

	constructor(
		@IConfigurationService private readonly _configuration: IConfigurationService,
		@IQuantumIDEWorkspaceStateService private readonly _workspaceState: IQuantumIDEWorkspaceStateService,
		@IWorkspaceContextService private readonly _workspace: IWorkspaceContextService,
		@IWorkbenchLayoutService private readonly _layout: IWorkbenchLayoutService,
	) {
		super();
		if (!isQuantumIDE()) {
			return;
		}

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
