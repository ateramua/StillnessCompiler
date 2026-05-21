/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../base/common/lifecycle.js';
import { localize, localize2 } from '../../nls.js';
import { Action2, registerAction2 } from '../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../platform/notification/common/notification.js';
import { IQuickInputService } from '../../platform/quickinput/common/quickInput.js';
import { isQuantumIDEProduct } from '../../platform/quantumide/common/quantumideChatPlatform.js';
import { QuantumIDEAICommandId } from '../../platform/quantumide/common/quantumideAISettings.js';
import product from '../../platform/product/common/product.js';
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from '../common/contributions.js';
import { IQuantumIDEContextInspectorService } from '../services/quantumide/common/quantumideContextInspector.js';
import { IQuantumIDEContextHealthService } from '../services/quantumide/common/quantumideContextHealth.js';
import { IQuantumIDEExecutionGraphService } from '../services/quantumide/common/quantumideExecutionGraph.js';
import { IQuantumIDEAgentStepGateService } from '../services/quantumide/common/quantumideAgentStepGate.js';
import { IQuantumIDEChatThreadStoreService } from '../services/quantumide/common/quantumideChatThreadStore.js';
import { IQuantumIDEMergeConflictService } from '../services/quantumide/browser/quantumideMergeConflictService.js';
import { IQuantumIDEChatRichUiService } from '../services/quantumide/common/quantumideChatRichUi.js';
import { ICodeEditorService } from '../../editor/browser/services/codeEditorService.js';

function isQuantumIDE(): boolean {
	return isQuantumIDEProduct(product.applicationName)
		|| [product.nameShort, product.nameLong].some(n => typeof n === 'string' && n.toLowerCase().includes('quantumide'));
}

class QuantumIDEPdrFulfillmentContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.quantumidePdrFulfillment';

	constructor(
		@IQuantumIDEExecutionGraphService private readonly _graph: IQuantumIDEExecutionGraphService,
		@IQuantumIDEChatRichUiService private readonly _richUi: IQuantumIDEChatRichUiService,
	) {
		super();
		if (!isQuantumIDE()) {
			return;
		}
		this._register(this._graph.onDidChange(() => {
			const checklist = this._graph.formatChecklist();
			if (checklist) {
				this._richUi.addCard({
					threadId: 'execution-graph',
					kind: 'info',
					title: localize('quantumide.executionGraph', 'Agent execution plan'),
					body: checklist,
					pinned: false,
				});
			}
		}));
		void this._graph.loadFromDisk();
	}
}

if (isQuantumIDE()) {
	registerWorkbenchContribution2(QuantumIDEPdrFulfillmentContribution.ID, QuantumIDEPdrFulfillmentContribution, WorkbenchPhase.AfterRestored);

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'quantumide.chat.openContextInspectorPanel',
				title: localize2('quantumide.chat.contextInspectorPanel', 'QuantumIDE: Open Context Inspector Panel'),
				category: { value: localize('quantumide.pdr', 'QuantumIDE PDR'), original: 'QuantumIDE PDR' },
				f1: true,
			});
		}
		override async run(accessor: ServicesAccessor): Promise<void> {
			const inspector = accessor.get(IQuantumIDEContextInspectorService);
			const health = accessor.get(IQuantumIDEContextHealthService);
			const quick = accessor.get(IQuickInputService);
			const h = health.getSnapshot();
			const sections = inspector.getSections();
			const items = sections.map(s => ({
				label: s.title,
				description: s.omitted ? localize('omitted', 'Omitted') : `${s.charCount} chars · ~${s.tokenEstimate ?? Math.ceil(s.charCount / 4)} tokens`,
				detail: s.stale ? localize('stale', 'Stale') : (s.error ?? ''),
			}));
			items.unshift({
				label: localize('quantumide.contextHealth', 'Context health: {0}', h.state),
				description: h.lastBuiltAt ? new Date(h.lastBuiltAt).toLocaleString() : '',
				detail: h.lastError ?? '',
			});
			await quick.pick(items, { placeHolder: localize('quantumide.contextInspectorPick', 'Context sections (PDR QPR-1.1)') });
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'quantumide.agent.stepOnce',
				title: localize2('quantumide.agent.stepOnce', 'QuantumIDE: Step Agent (One Tool)'),
				category: { value: localize('quantumide.pdr', 'QuantumIDE PDR'), original: 'QuantumIDE PDR' },
				f1: true,
			});
		}
		override run(accessor: ServicesAccessor): void {
			const gate = accessor.get(IQuantumIDEAgentStepGateService);
			gate.enableStepMode(true);
			gate.resume();
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'quantumide.chat.exportThreadsEncrypted',
				title: localize2('quantumide.chat.exportThreadsEncrypted', 'QuantumIDE: Export Chat Threads (Encrypted)'),
				category: { value: localize('quantumide.pdr', 'QuantumIDE PDR'), original: 'QuantumIDE PDR' },
				f1: true,
			});
		}
		override async run(accessor: ServicesAccessor): Promise<void> {
			const pass = await accessor.get(IQuickInputService).input({ title: localize('quantumide.passphrase', 'Export passphrase'), password: true });
			if (!pass) {
				return;
			}
			const payload = await accessor.get(IQuantumIDEChatThreadStoreService).exportThreadsEncrypted(pass);
			accessor.get(INotificationService).info(localize('quantumide.exported', 'Exported {0} chars (copy from notification log).', payload.length));
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'quantumide.merge.resolveFromChat',
				title: localize2('quantumide.merge.resolveFromChat', 'QuantumIDE: Resolve Merge Conflict (Current)'),
				category: { value: localize('quantumide.pdr', 'QuantumIDE PDR'), original: 'QuantumIDE PDR' },
				f1: true,
			});
		}
		override async run(accessor: ServicesAccessor): Promise<void> {
			const merge = accessor.get(IQuantumIDEMergeConflictService);
			const editor = accessor.get(ICodeEditorService);
			const uri = editor.getActiveCodeEditor()?.getModel()?.uri;
			const result = await merge.resolveConflictAction('accept_current', uri);
			accessor.get(INotificationService).info(result.message);
			if (uri) {
				accessor.get(IQuantumIDEChatRichUiService).addCard({
					threadId: 'merge',
					kind: 'scm',
					title: localize('quantumide.mergeCard', 'Merge conflict'),
					body: result.message,
					pinned: true,
					command: QuantumIDEAICommandId.ChatReviewPendingEdits,
				});
			}
		}
	});

}
