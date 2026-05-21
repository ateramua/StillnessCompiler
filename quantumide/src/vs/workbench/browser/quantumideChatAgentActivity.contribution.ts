/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import './media/quantumideChatAgentActivity.css';
import { localize2 } from '../../nls.js';
import { Action2, registerAction2 } from '../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../platform/instantiation/common/instantiation.js';
import { isQuantumIDEProduct } from '../../platform/quantumide/common/quantumideChatPlatform.js';
import product from '../../platform/product/common/product.js';
import { URI } from '../../base/common/uri.js';
import { IEditorService } from '../services/editor/common/editorService.js';
import { IWorkspaceContextService } from '../../platform/workspace/common/workspace.js';
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from '../common/contributions.js';
import { Disposable } from '../../base/common/lifecycle.js';

export const QuantumIDEChatOpenActivityPathCommandId = 'quantumide.chat.openActivityPath';

function isQuantumIDE(): boolean {
	return isQuantumIDEProduct(product.applicationName)
		|| [product.nameShort, product.nameLong].some(n => typeof n === 'string' && n.toLowerCase().includes('quantumide'));
}

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: QuantumIDEChatOpenActivityPathCommandId,
			title: localize2('quantumide.chat.openActivityPath', 'Open File from Agent Activity'),
			f1: false,
		});
	}
	async run(accessor: ServicesAccessor, path?: string, line?: number): Promise<void> {
		const raw = String(path ?? '').trim();
		if (!raw) {
			return;
		}
		const workspace = accessor.get(IWorkspaceContextService);
		const folder = workspace.getWorkspace().folders[0]?.uri;
		const resource = raw.startsWith('file:') ? URI.parse(raw) : folder ? URI.joinPath(folder, raw) : URI.file(raw);
		await accessor.get(IEditorService).openEditor({
			resource,
			options: line && line > 0
				? { selection: { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: 1 } }
				: undefined,
		});
	}
});

class QuantumIDEChatAgentActivityBootstrapContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.quantumideChatAgentActivityBootstrap';
}

if (isQuantumIDE()) {
	registerWorkbenchContribution2(QuantumIDEChatAgentActivityBootstrapContribution.ID, QuantumIDEChatAgentActivityBootstrapContribution, WorkbenchPhase.AfterRestored);
}
