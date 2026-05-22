/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Action } from '../../../../base/common/actions.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { isBenignQuantumIDERendererError } from '../../../../platform/quantumide/common/quantumideBenignErrors.js';
import { redactQuantumIDESecrets } from '../../../../platform/quantumide/common/quantumideSecretRedaction.js';
import {
	IQuantumIDEErrorRecoveryService,
	IQuantumIDEErrorReport,
} from '../common/quantumideErrorRecovery.js';

export class QuantumIDEErrorRecoveryService extends Disposable implements IQuantumIDEErrorRecoveryService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidReport = this._register(new Emitter<IQuantumIDEErrorReport>());
	readonly onDidReport = this._onDidReport.event;

	private readonly _recent: IQuantumIDEErrorReport[] = [];

	constructor(
		@INotificationService private readonly _notifications: INotificationService,
		@ICommandService private readonly _commands: ICommandService,
	) {
		super();
	}

	getRecent(): readonly IQuantumIDEErrorReport[] {
		return this._recent;
	}

	clear(id: string): void {
		const idx = this._recent.findIndex(r => r.id === id);
		if (idx >= 0) {
			this._recent.splice(idx, 1);
		}
	}

	report(report: IQuantumIDEErrorReport): void {
		if (isBenignQuantumIDERendererError(report.message)) {
			return;
		}
		const safe: IQuantumIDEErrorReport = {
			...report,
			message: redactQuantumIDESecrets(report.message),
		};
		this._recent.unshift(safe);
		if (this._recent.length > 32) {
			this._recent.length = 32;
		}
		this._onDidReport.fire(report);
		this._notifications.notify({
			severity: Severity.Error,
			message: report.message,
			source: 'QuantumIDE',
			actions: safe.recoverable && safe.retryCommand
				? {
					primary: [new Action(
						'quantumide.error.retry',
						localize('quantumide.error.retry', 'Retry'),
						undefined,
						true,
						() => { void this._commands.executeCommand(safe.retryCommand!, ...(safe.retryArgs ?? [])); },
					)],
				}
				: undefined,
		});
	}
}

registerSingleton(IQuantumIDEErrorRecoveryService, QuantumIDEErrorRecoveryService, InstantiationType.Delayed);
