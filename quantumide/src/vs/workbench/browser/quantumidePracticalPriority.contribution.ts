/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../base/common/async.js';
import { Disposable } from '../../base/common/lifecycle.js';
import { localize } from '../../nls.js';
import { IConfigurationService } from '../../platform/configuration/common/configuration.js';
import { IFileService } from '../../platform/files/common/files.js';
import { INotificationService, Severity } from '../../platform/notification/common/notification.js';
import { isQuantumIDEProduct } from '../../platform/quantumide/common/quantumideChatPlatform.js';
import { drainQuantumIDEChatInjectEvents } from '../../platform/quantumide/common/quantumideChatInjectStore.js';
import { QuantumIDEAISettingId } from '../../platform/quantumide/common/quantumideAISettings.js';
import product from '../../platform/product/common/product.js';
import { IWorkspaceContextService } from '../../platform/workspace/common/workspace.js';
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from '../common/contributions.js';
import { IQuantumIDEOnboardingService } from '../services/quantumide/browser/quantumideOnboardingService.js';
import { IQuantumIDEReplSessionService } from '../services/quantumide/browser/quantumideReplSessionService.js';
import { IQuantumIDETerminalBlockService } from '../services/quantumide/common/quantumideTerminalBlock.js';

function isQuantumIDE(): boolean {
	return isQuantumIDEProduct(product.applicationName)
		|| [product.nameShort, product.nameLong].some(n => typeof n === 'string' && n.toLowerCase().includes('quantumide'));
}

const TOUR_STEPS = [
	{ title: 'Chat context', body: 'Open files, selection, and diagnostics are attached automatically. Use @ in chat for files and symbols.' },
	{ title: 'Agent edits', body: 'Staged edits appear as cards in the chat thread and in the review bar. Accept or reject per file or in bulk.' },
	{ title: 'Search & index', body: 'Background indexing keeps code search fresh. Use the chat panel Code Search view for previews.' },
	{ title: 'Run & verify', body: 'Terminal and test output appear as structured blocks in chat. Use run_workspace_check after substantive changes.' },
	{ title: 'Step mode', body: 'Pause the agent before each tool (workbench + host). Use Agent Step Once when debugging risky operations.' },
] as const;

class QuantumIDEChatInjectDrainContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.quantumideChatInjectDrain';

	private readonly _poll = this._register(new RunOnceScheduler(() => void this._drain(), 5000));

	constructor(
		@IFileService private readonly _files: IFileService,
		@IWorkspaceContextService private readonly _workspace: IWorkspaceContextService,
		@IQuantumIDETerminalBlockService private readonly _blocks: IQuantumIDETerminalBlockService,
	) {
		super();
		if (!isQuantumIDE()) {
			return;
		}
		this._register(this._files.onDidFilesChange(() => this._poll.schedule()));
		// One-shot after workbench restore — avoid a perpetual 1.2s poll loop on the UI thread.
		this._register(new RunOnceScheduler(() => this._poll.schedule(), 20_000)).schedule();
	}

	private async _drain(): Promise<void> {
		const root = this._workspace.getWorkspace().folders[0]?.uri;
		const events = await drainQuantumIDEChatInjectEvents(this._files, root);
		for (const ev of events) {
			if (ev.kind === 'terminal') {
				this._blocks.recordTerminalRun(ev.command, ev.exitCode, ev.output);
			} else {
				this._blocks.recordTestOutput(ev.output);
			}
		}
	}
}

class QuantumIDETerminalAndReplBlocksContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.quantumideTerminalReplBlocks';

	constructor(
		@IQuantumIDEReplSessionService repl: IQuantumIDEReplSessionService,
		@IQuantumIDETerminalBlockService blocks: IQuantumIDETerminalBlockService,
	) {
		super();
		if (!isQuantumIDE()) {
			return;
		}
		this._register(repl.onDidRun(e => {
			blocks.recordTerminalRun('repl', /error|exception/i.test(e.output) ? 1 : 0, e.output);
		}));
	}
}

class QuantumIDECollabHonestyContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.quantumideCollabHonesty';

	constructor(
		@IConfigurationService private readonly _configuration: IConfigurationService,
		@INotificationService private readonly _notifications: INotificationService,
	) {
		super();
		if (!isQuantumIDE()) {
			return;
		}
		if (this._configuration.getValue<boolean>(QuantumIDEAISettingId.CollabExperimentalAcknowledged) === true) {
			return;
		}
		this._notifications.prompt(
			Severity.Info,
			localize(
				'quantumide.collab.experimental',
				'Collaboration is **experimental**: encrypted session export + optional WebSocket relay. There is no CRDT/OT shared editing yet. Use Connect Collaboration Relay only when you need live message sync.',
			),
			[{
				label: localize('quantumide.collab.ack', 'Got it'),
				run: () => this._configuration.updateValue(QuantumIDEAISettingId.CollabExperimentalAcknowledged, true),
			}],
			{ sticky: true },
		);
	}
}

class QuantumIDEProductTourContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.quantumideProductTour';

	constructor(
		@IQuantumIDEOnboardingService private readonly _onboarding: IQuantumIDEOnboardingService,
		@INotificationService private readonly _notifications: INotificationService,
		@IConfigurationService private readonly _configuration: IConfigurationService,
	) {
		super();
		if (!isQuantumIDE() || this._onboarding.hasCompletedOnboarding() || this._onboarding.hasSkippedTour()) {
			return;
		}
		if (this._configuration.getValue<boolean>(QuantumIDEAISettingId.ChatFeatureParityEnabled) === false) {
			return;
		}
		let step = this._onboarding.getTourStep();
		const show = () => {
			if (step >= TOUR_STEPS.length) {
				this._onboarding.markOnboardingComplete();
				return;
			}
			const tip = TOUR_STEPS[step];
			this._notifications.prompt(
				Severity.Info,
				`**${tip.title}** (${step + 1}/${TOUR_STEPS.length})\n\n${tip.body}`,
				[{
					label: localize('quantumide.tour.next', 'Next'),
					run: () => {
						step++;
						this._onboarding.setTourStep(step);
						show();
					},
				}, {
					label: localize('quantumide.tour.skip', 'Skip tour'),
					run: () => this._onboarding.skipTour(),
				}],
			);
		};
		show();
	}
}

if (isQuantumIDE()) {
	registerWorkbenchContribution2(QuantumIDEChatInjectDrainContribution.ID, QuantumIDEChatInjectDrainContribution, WorkbenchPhase.AfterRestored);
	registerWorkbenchContribution2(QuantumIDETerminalAndReplBlocksContribution.ID, QuantumIDETerminalAndReplBlocksContribution, WorkbenchPhase.AfterRestored);
	registerWorkbenchContribution2(QuantumIDECollabHonestyContribution.ID, QuantumIDECollabHonestyContribution, WorkbenchPhase.Eventually);
	registerWorkbenchContribution2(QuantumIDEProductTourContribution.ID, QuantumIDEProductTourContribution, WorkbenchPhase.Eventually);
}
