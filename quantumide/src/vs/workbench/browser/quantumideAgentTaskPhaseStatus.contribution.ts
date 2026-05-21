/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import './media/quantumideAgentTaskPhase.css';
import { Disposable, MutableDisposable } from '../../base/common/lifecycle.js';
import { localize, localize2 } from '../../nls.js';
import { Action2, registerAction2 } from '../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../platform/instantiation/common/instantiation.js';
import { isQuantumIDEProduct } from '../../platform/quantumide/common/quantumideChatPlatform.js';
import { QuantumIDEAICommandId, QuantumIDEAISettingId } from '../../platform/quantumide/common/quantumideAISettings.js';
import product from '../../platform/product/common/product.js';
import { IConfigurationService } from '../../platform/configuration/common/configuration.js';
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from '../common/contributions.js';
import { IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment } from '../services/statusbar/browser/statusbar.js';
import { IQuantumIDEAgentTaskPhaseStatusService } from '../services/quantumide/common/quantumideAgentTaskPhaseStatus.js';
import { IOutputService } from '../services/output/common/output.js';
import { QuantumIDEAgentActivityOutputChannelId } from '../contrib/chat/browser/agentSessions/agentHost/quantumideAgentActivityLog.js';
import { MarkdownString } from '../../base/common/htmlContent.js';
import { ICommandService } from '../../platform/commands/common/commands.js';
import '../services/quantumide/browser/quantumideAgentTaskPhaseStatusService.js';

function isQuantumIDE(): boolean {
	return isQuantumIDEProduct(product.applicationName)
		|| [product.nameShort, product.nameLong].some(n => typeof n === 'string' && n.toLowerCase().includes('quantumide'));
}

class QuantumIDEAgentTaskPhaseStatusContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.quantumideAgentTaskPhaseStatus';

	private readonly _entry = this._register(new MutableDisposable<IStatusbarEntryAccessor>());

	constructor(
		@IStatusbarService private readonly _statusbar: IStatusbarService,
		@IQuantumIDEAgentTaskPhaseStatusService private readonly _phaseStatus: IQuantumIDEAgentTaskPhaseStatusService,
		@IConfigurationService private readonly _config: IConfigurationService,
	) {
		super();
		if (!isQuantumIDE() || this._config.getValue<boolean>(QuantumIDEAISettingId.AgentTaskPhaseStatusEnabled) === false) {
			return;
		}
		this._refresh();
		this._register(this._phaseStatus.onDidChange(() => this._refresh()));
		this._register(this._config.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(QuantumIDEAISettingId.AgentTaskPhaseStatusEnabled)
				|| e.affectsConfiguration(QuantumIDEAISettingId.AgentTaskPhaseStatusLocation)) {
				this._refresh();
			}
		}));
	}

	private _refresh(): void {
		this._entry.clear();
		if (this._config.getValue<boolean>(QuantumIDEAISettingId.AgentTaskPhaseStatusEnabled) === false) {
			return;
		}
		const location = this._config.getValue<string>(QuantumIDEAISettingId.AgentTaskPhaseStatusLocation) ?? 'statusBar';
		if (location === 'hidden') {
			return;
		}
		const state = this._phaseStatus.getState();
		if (!state.visible && state.phase === 'idle') {
			return;
		}
		const p = state.presentation;
		const text = `${p.icon} ${p.message}`;
		const tooltipLines = [p.message];
		if (state.detail) {
			tooltipLines.push(state.detail);
		}
		if (state.toolName) {
			tooltipLines.push(localize('quantumide.taskPhase.tool', 'Tool: {0}', state.toolName));
		}
		tooltipLines.push(localize('quantumide.taskPhase.clickDetails', 'Click for agent activity details'));
		this._entry.value = this._statusbar.addEntry({
			name: localize('quantumide.taskPhase.statusName', 'Agent task phase'),
			text,
			ariaLabel: p.ariaLabel,
			role: 'status',
			tooltip: new MarkdownString(tooltipLines.join('\n\n')),
			command: QuantumIDEAICommandId.AgentShowTaskPhaseDetails,
			showProgress: p.spinning,
			kind: p.kind,
			showInAllWindows: true,
		}, 'quantumide.agentTaskPhase', StatusbarAlignment.LEFT, 5);
	}
}

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: QuantumIDEAICommandId.AgentShowTaskPhaseDetails,
			title: localize2('quantumide.agent.taskPhaseDetails', 'QuantumIDE: Agent Task Phase Details'),
			category: localize('quantumide.category', 'QuantumIDE'),
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const phaseStatus = accessor.get(IQuantumIDEAgentTaskPhaseStatusService);
		const output = accessor.get(IOutputService);
		const state = phaseStatus.getState();
		await output.showChannel(QuantumIDEAgentActivityOutputChannelId, true);
		const channel = output.getChannel(QuantumIDEAgentActivityOutputChannelId);
		channel?.append(`\n--- Task phase: ${state.presentation.message} (${state.phase}) @ ${new Date(state.updatedAt).toISOString()} ---\n`);
		if (state.detail) {
			channel?.append(`${state.detail}\n`);
		}
		await accessor.get(ICommandService).executeCommand('workbench.action.openAgentSessionsWelcome');
	}
});

if (isQuantumIDE()) {
	registerWorkbenchContribution2(QuantumIDEAgentTaskPhaseStatusContribution.ID, QuantumIDEAgentTaskPhaseStatusContribution, WorkbenchPhase.AfterRestored);
}
