/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Registry } from '../../platform/registry/common/platform.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../platform/configuration/common/configurationRegistry.js';
import product from '../../platform/product/common/product.js';

/**
 * QuantumIDE defaults: steer first-run / unset profiles to the in-editor Agent Sessions
 * welcome (chat-first) and away from the secondary side bar, where legacy Copilot chat lives.
 * User settings always win over these defaults.
 */
if (product.nameShort === 'QuantumIDE') {
	Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerDefaultConfigurations([
		{
			source: 'quantumide',
			overrides: {
				'workbench.startupEditor': 'agentSessionsWelcomePage',
				// New workspaces: hide secondary side bar (GitHub Copilot Chat) unless user opts in.
				'workbench.secondarySideBar.defaultVisibility': 'hidden',
				'quantumide.ai.indexing.enabled': false,
				'quantumide.index.memoryBudgetMb': 512,
				'quantumide.ai.agent.velocity.crossRootSearch': true,
				'quantumide.ai.semanticIndexing.enabled': false,
				'quantumide.chat.syncRealtime': true,
				'quantumide.workspace.autoRestoreSession': false,
				'quantumide.workspace.autoSaveSession': false,
				'quantumide.chat.inline.enabled': true,
				'quantumide.chat.agentActivity.enabled': true,
				'quantumide.chat.cursorParity.enabled': false,
				'quantumide.chat.featureParity.enabled': true,
				'quantumide.chat.collab.enabled': false,
				'quantumide.chat.collab.experimental': false,
				'quantumide.collab.experimentalAcknowledged': false,
				'quantumide.chat.attachments.enabled': true,
				'quantumide.chat.perfInstrumentation.enabled': true,
				'quantumide.chat.perfInstrumentation.verbose': false,
				'quantumide.chat.perfInstrumentation.logToConsole': false,
				'quantumide.ai.agent.autoApplyEdits': true,
				'quantumide.ai.agent.instantPaletteCommands': false,
				'quantumide.ai.agent.verifyOnEdit': 'defer',
				'quantumide.ai.agent.preferDirectEditorEdits': false,
				'quantumide.ai.agent.directEditorMaxLines': 100,
				'quantumide.ai.agent.fastApplyEdits': true,
				'quantumide.ai.agent.editVelocity': 'maximum',
				'quantumide.ai.agent.waitForIndexingBeforeEdits': false,
				'quantumide.ai.agent.velocityProfile': 'ship',
				'quantumide.ai.agent.velocity.attachWorkspaceContext': false,
				'quantumide.ai.agent.velocity.handoffEnabled': false,
				'quantumide.agent.iterateUntilComplete': false,
				'quantumide.terminal.autoApproveSafe': true,
				'quantumide.ai.agent.requireConfirmationForTerminal': false,
				'chat.tools.renameTool.enabled': true,
				'chat.agentHost.clientTools': [
					'rename',
					'runTask',
					'getTaskOutput',
					'problems',
					'runTests',
					'getTerminalOutput',
					'sendToTerminal',
					'quantumide_manipulate_editor',
					'quantumide_get_open_buffers',
					'quantumide_lsp_workspace_rename',
					'quantumide_read_unsaved_buffer',
					'quantumide_write_unsaved_buffer',
					'quantumide_invoke_plugin',
					'quantumide_run_terminal_command',
					'quantumide_update_setting',
					'quantumide_manage_extension',
					'quantumide_run_lsp_action',
				],
			},
		},
	]);
}
