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
			},
		},
	]);
}
