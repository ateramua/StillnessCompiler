/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, MutableDisposable } from '../../base/common/lifecycle.js';
import { localize } from '../../nls.js';
import product from '../../platform/product/common/product.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../common/contributions.js';
import { IChatEntitlementService } from '../services/chat/common/chatEntitlementService.js';
import { IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment } from '../services/statusbar/browser/statusbar.js';

/** Must match `AgentSessionsWelcomePage.COMMAND_ID` in welcomeAgentSessions. */
const OPEN_AGENT_SESSIONS_WELCOME_COMMAND_ID = 'workbench.action.openAgentSessionsWelcome';

export class QuantumideAgentHomeStatusContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.quantumideAgentHomeStatus';

	private readonly entry = this._register(new MutableDisposable<IStatusbarEntryAccessor>());

	constructor(
		@IStatusbarService private readonly statusbarService: IStatusbarService,
		@IChatEntitlementService private readonly chatEntitlementService: IChatEntitlementService,
	) {
		super();
		this.refresh();
		this._register(this.chatEntitlementService.onDidChangeSentiment(() => this.refresh()));
	}

	private refresh(): void {
		this.entry.clear();
		if (this.chatEntitlementService.sentiment.hidden) {
			return;
		}
		this.entry.value = this.statusbarService.addEntry({
			name: localize('quantumide.agentHomeStatusName', 'Agent sessions'),
			text: '$(home)',
			ariaLabel: localize('quantumide.agentHomeStatusAria', 'Open Agent Sessions home'),
			tooltip: localize('quantumide.agentHomeStatusTooltip', 'Open Agent Sessions Welcome (chat and sessions)'),
			command: OPEN_AGENT_SESSIONS_WELCOME_COMMAND_ID,
			showInAllWindows: true,
		}, 'quantumide.agentSessionsHome', StatusbarAlignment.RIGHT, {
			location: { id: 'chat.statusBarEntry', priority: -1 },
			alignment: StatusbarAlignment.LEFT,
			compact: true,
		});
	}
}

if (product.nameShort === 'QuantumIDE') {
	registerWorkbenchContribution2(QuantumideAgentHomeStatusContribution.ID, QuantumideAgentHomeStatusContribution, WorkbenchPhase.AfterRestored);
}
