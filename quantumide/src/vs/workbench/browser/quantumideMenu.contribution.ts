/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { ToggleAuxiliaryBarAction } from './parts/auxiliarybar/auxiliaryBarActions.js';
import { localize } from '../../nls.js';
import { MenuRegistry, MenuId } from '../../platform/actions/common/actions.js';
import product from '../../platform/product/common/product.js';
import { ChatContextKeys } from '../contrib/chat/common/actions/chatContextKeys.js';
import { OPEN_AGENTS_WINDOW_PRECONDITION, OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID } from '../contrib/chat/common/constants.js';

/** Must match `AgentSessionsWelcomePage.COMMAND_ID` in welcomeAgentSessions. */
const OPEN_AGENT_SESSIONS_WELCOME_COMMAND_ID = 'workbench.action.openAgentSessionsWelcome';

if (product.nameShort === 'QuantumIDE') {
	MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
		group: '1_open',
		command: {
			id: ToggleAuxiliaryBarAction.ID,
			title: localize({ key: 'quantumide.miToggleCopilotSidebar', comment: ['&& denotes a mnemonic'] }, 'Toggle &&Copilot / Chat side bar'),
		},
		when: ChatContextKeys.enabled,
		order: 21,
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
		group: '1_open',
		command: {
			id: OPEN_AGENT_SESSIONS_WELCOME_COMMAND_ID,
			title: localize({ key: 'quantumide.miAgentSessionsHome', comment: ['&& denotes a mnemonic'] }, 'Agent &&Sessions Home'),
		},
		when: ChatContextKeys.enabled,
		order: 22,
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
		group: '1_open',
		command: {
			id: OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID,
			title: localize({ key: 'quantumide.miOpenAgentsApp', comment: ['&& denotes a mnemonic'] }, 'Open &&Agents App…'),
		},
		when: OPEN_AGENTS_WINDOW_PRECONDITION,
		order: 23,
	});
}
