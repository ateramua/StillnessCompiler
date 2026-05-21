/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Option B phased program — registers Phase 2 collab cursor decorations and wires program services.
 */

import { Disposable } from '../../base/common/lifecycle.js';
import { isQuantumIDEProduct } from '../../platform/quantumide/common/quantumideChatPlatform.js';
import product from '../../platform/product/common/product.js';
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from '../common/contributions.js';
import '../services/quantumide/browser/quantumideCollabCursorDecorationsService.js';
import '../services/quantumide/browser/quantumideCollabChatContextSyncService.js';

function isQuantumIDE(): boolean {
	return isQuantumIDEProduct(product.applicationName)
		|| [product.nameShort, product.nameLong].some(n => typeof n === 'string' && n.toLowerCase().includes('quantumide'));
}

class QuantumIDECursorChatParityProgramContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.quantumideCursorChatParityProgram';
}

if (isQuantumIDE()) {
	registerWorkbenchContribution2(
		QuantumIDECursorChatParityProgramContribution.ID,
		QuantumIDECursorChatParityProgramContribution,
		WorkbenchPhase.AfterRestored,
	);
}
