/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../nls.js';
import { Action2, registerAction2 } from '../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../platform/instantiation/common/instantiation.js';
import { isQuantumIDEProduct } from '../../platform/quantumide/common/quantumideChatPlatform.js';
import { QuantumIDEAICommandId } from '../../platform/quantumide/common/quantumideAISettings.js';
import product from '../../platform/product/common/product.js';
import { IQuantumIDEAgentWorkflowOptimizationService } from '../services/quantumide/browser/quantumideAgentWorkflowOptimizationService.js';
import { INotificationService } from '../../platform/notification/common/notification.js';
import '../services/quantumide/browser/quantumideAgentWorkflowOptimizationService.js';

function isQuantumIDE(): boolean {
	return isQuantumIDEProduct(product.applicationName)
		|| [product.nameShort, product.nameLong].some(n => typeof n === 'string' && n.toLowerCase().includes('quantumide'));
}

if (isQuantumIDE()) {
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: QuantumIDEAICommandId.AgentRunDeferredVerification,
				title: localize2('quantumide.agent.runDeferredVerify', 'QuantumIDE: Run Deferred Agent Verification'),
				category: { value: localize('quantumide.ai.category', 'QuantumIDE AI'), original: 'QuantumIDE AI' },
				f1: true,
			});
		}
		override async run(accessor: ServicesAccessor): Promise<void> {
			const result = await accessor.get(IQuantumIDEAgentWorkflowOptimizationService).runDeferredVerification();
			accessor.get(INotificationService).info(result);
		}
	});
}
