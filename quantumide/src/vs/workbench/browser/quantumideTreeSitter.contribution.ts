/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../common/contributions.js';
import { ITreeSitterLibraryService } from '../../editor/common/services/treeSitter/treeSitterLibraryService.js';
import { ILogService } from '../../platform/log/common/log.js';
import { isQuantumIDEProduct } from '../../platform/quantumide/common/quantumideChatPlatform.js';
import { registerQuantumIDETreeSitterParserAdapter } from '../services/quantumide/browser/quantumideTreeSitterParserAdapter.js';
import product from '../../platform/product/common/product.js';

class QuantumIDETreeSitterContribution implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.quantumideTreeSitter';

	constructor(
		@ITreeSitterLibraryService treeSitterLibraryService: ITreeSitterLibraryService,
		@ILogService logService: ILogService,
	) {
		if (isQuantumIDEProduct(product.applicationName)) {
			registerQuantumIDETreeSitterParserAdapter(treeSitterLibraryService, logService);
		}
	}
}

registerWorkbenchContribution2(QuantumIDETreeSitterContribution.ID, QuantumIDETreeSitterContribution, WorkbenchPhase.AfterRestored);
