/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { QuantumIDEAISettingId } from '../../../../platform/quantumide/common/quantumideAISettings.js';
import {
	clearDeferredVerificationQueue,
	readDeferredVerificationQueue,
} from '../../../../platform/quantumide/common/quantumideDeferredVerificationStore.js';
import { ITerminalService } from '../../../contrib/terminal/browser/terminal.js';
import { normalizeVerifyOnEdit } from '../../../../platform/quantumide/common/quantumideWorkflowOptimization.js';

export interface IQuantumIDEAgentWorkflowOptimizationService {
	readonly _serviceBrand: undefined;
	notifyVerificationSkippedOrDeferred(mode: 'defer' | 'never', detail?: string): void;
	runDeferredVerification(): Promise<string>;
	getDeferredVerificationCount(): Promise<number>;
}

export const IQuantumIDEAgentWorkflowOptimizationService = createDecorator<IQuantumIDEAgentWorkflowOptimizationService>('quantumIDEAgentWorkflowOptimizationService');

export class QuantumIDEAgentWorkflowOptimizationService implements IQuantumIDEAgentWorkflowOptimizationService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IFileService private readonly _files: IFileService,
		@IWorkspaceContextService private readonly _workspace: IWorkspaceContextService,
		@IConfigurationService private readonly _configuration: IConfigurationService,
		@INotificationService private readonly _notifications: INotificationService,
		@ITerminalService private readonly _terminal: ITerminalService,
	) { }

	notifyVerificationSkippedOrDeferred(mode: 'defer' | 'never', detail?: string): void {
		const verifyOnEdit = normalizeVerifyOnEdit(this._configuration.getValue(QuantumIDEAISettingId.AgentVerifyOnEdit));
		if (verifyOnEdit !== mode) {
			return;
		}
		const message = mode === 'defer'
			? localize('quantumide.verify.deferred', 'Verification deferred. Run **QuantumIDE: Run Deferred Agent Verification** when ready.{0}', detail ? ` ${detail}` : '')
			: localize('quantumide.verify.never', 'Automatic verification is off (verifyOnEdit=never).{0}', detail ? ` ${detail}` : '');
		this._notifications.notify({ severity: Severity.Info, message });
	}

	async getDeferredVerificationCount(): Promise<number> {
		const folder = this._workspace.getWorkspace().folders[0]?.uri;
		if (!folder) {
			return 0;
		}
		return (await readDeferredVerificationQueue(this._files, folder)).length;
	}

	async runDeferredVerification(): Promise<string> {
		const folder = this._workspace.getWorkspace().folders[0]?.uri;
		if (!folder) {
			return localize('quantumide.verify.noFolder', 'Open a workspace folder first.');
		}
		const entries = await readDeferredVerificationQueue(this._files, folder);
		if (entries.length === 0) {
			return localize('quantumide.verify.empty', 'No deferred verification checks queued.');
		}
		const checks = [...new Set(entries.map(e => e.check))];
		const instance = await this._terminal.getActiveOrCreateInstance();
		for (const check of checks) {
			const cmd = check === 'test' ? 'npm test' : check === 'lint' ? 'npm run lint' : 'npm run compile';
			await instance.sendText(cmd, true);
		}
		await clearDeferredVerificationQueue(this._files, folder);
		this._notifications.info(localize('quantumide.verify.started', 'Started deferred verification in terminal: {0}', checks.join(', ')));
		return localize('quantumide.verify.ran', 'Ran deferred checks: {0}', checks.join(', '));
	}
}

registerSingleton(IQuantumIDEAgentWorkflowOptimizationService, QuantumIDEAgentWorkflowOptimizationService, InstantiationType.Delayed);
