/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Cursor Chat Panel — six-requirement parity bundle.
 * 1 Auto-apply edits  2 Live inline suggestions  3 Full IDE integration
 * 4 Workspace LSP rename  5 Real-time collaboration  6 Rich UI interactions
 */

import { Disposable } from '../../base/common/lifecycle.js';
import { localize, localize2 } from '../../nls.js';
import { Action2, registerAction2 } from '../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../platform/configuration/common/configuration.js';
import { INotificationService } from '../../platform/notification/common/notification.js';
import { isQuantumIDEProduct } from '../../platform/quantumide/common/quantumideChatPlatform.js';
import { QuantumIDEAISettingId } from '../../platform/quantumide/common/quantumideAISettings.js';
import product from '../../platform/product/common/product.js';
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from '../common/contributions.js';
import { IQuantumIDEIdeIntegrationService } from '../services/quantumide/common/quantumideIdeIntegration.js';
import '../services/quantumide/browser/quantumideIdeIntegrationService.js';
import '../services/quantumide/browser/quantumideEditorAssistantOverlayService.js';
import '../services/quantumide/browser/quantumideCollabChatContextSyncService.js';

function isQuantumIDE(): boolean {
	return isQuantumIDEProduct(product.applicationName)
		|| [product.nameShort, product.nameLong].some(n => typeof n === 'string' && n.toLowerCase().includes('quantumide'));
}

class QuantumIDECursorParitySixBootstrapContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.quantumideCursorParitySixBootstrap';
}

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'quantumide.chat.toggleAutoApply',
			title: localize2('quantumide.chat.toggleAutoApply', 'QuantumIDE: Toggle Auto-Apply Edits'),
			category: localize2('quantumide.category', 'QuantumIDE'),
			f1: true,
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const config = accessor.get(IConfigurationService);
		const current = config.getValue<boolean>(QuantumIDEAISettingId.AgentAutoApplyEdits) === true;
		await config.updateValue(QuantumIDEAISettingId.AgentAutoApplyEdits, !current);
		accessor.get(INotificationService).info(
			current
				? localize('quantumide.autoApplyOff', 'Auto-apply disabled. Edits require review in chat.')
				: localize('quantumide.autoApplyOn', 'Auto-apply enabled. Agent edits apply immediately (undo via editor).'),
		);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'quantumide.chat.instantRefactor',
			title: localize2('quantumide.chat.instantRefactor', 'QuantumIDE: Instant Refactor (Format)'),
			category: localize2('quantumide.category', 'QuantumIDE'),
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		await accessor.get(IQuantumIDEIdeIntegrationService).runLspAction('format');
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'quantumide.chat.instantRename',
			title: localize2('quantumide.chat.instantRename', 'QuantumIDE: Instant LSP Rename'),
			category: localize2('quantumide.category', 'QuantumIDE'),
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		await accessor.get(IQuantumIDEIdeIntegrationService).runLspAction('rename');
	}
});

if (isQuantumIDE()) {
	registerWorkbenchContribution2(QuantumIDECursorParitySixBootstrapContribution.ID, QuantumIDECursorParitySixBootstrapContribution, WorkbenchPhase.AfterRestored);
}
