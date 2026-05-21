/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Registers singletons and workbench hooks for the 8-feature Cursor chat parity pass.
 */

import { Disposable } from '../../base/common/lifecycle.js';
import { isQuantumIDEProduct } from '../../platform/quantumide/common/quantumideChatPlatform.js';
import product from '../../platform/product/common/product.js';
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from '../common/contributions.js';
import '../services/quantumide/browser/quantumideEditorManipulationService.js';
import '../services/quantumide/browser/quantumideOpenBuffersService.js';
import '../services/quantumide/browser/quantumideUnsavedBufferService.js';
import '../services/quantumide/browser/quantumideWorkspaceRenameService.js';
import '../services/quantumide/browser/quantumideCollabLiveEditService.js';
import '../services/quantumide/browser/quantumidePluginBridgeService.js';

function isQuantumIDE(): boolean {
	return isQuantumIDEProduct(product.applicationName)
		|| [product.nameShort, product.nameLong].some(n => typeof n === 'string' && n.toLowerCase().includes('quantumide'));
}

class QuantumIDEChatEightFeaturesContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.quantumideChatEightFeatures';
}

if (isQuantumIDE()) {
	registerWorkbenchContribution2(QuantumIDEChatEightFeaturesContribution.ID, QuantumIDEChatEightFeaturesContribution, WorkbenchPhase.AfterRestored);
}
