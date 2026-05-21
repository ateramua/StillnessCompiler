/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * QuantumIDE Chat Panel — 8-step feature parity implementation.
 * 1 Inline suggestions + accept/reject (editor + chat)
 * 2 Real-time editor manipulation
 * 3 Workspace LSP refactor from chat
 * 4 Plugin ecosystem bootstrap
 * 5 Rich inline UI in chat
 * 6 Real-time context awareness (orchestrator cursor/content sync)
 * 7 Auto-apply changes (unified pipeline + settings)
 * 8 Multi-file batch review UI
 */

import { Disposable } from '../../base/common/lifecycle.js';
import { localize, localize2 } from '../../nls.js';
import { Action2, registerAction2 } from '../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../platform/notification/common/notification.js';
import { IQuickInputService } from '../../platform/quickinput/common/quickInput.js';
import { isQuantumIDEProduct } from '../../platform/quantumide/common/quantumideChatPlatform.js';
import { getQuantumIDEPlugins } from '../../platform/quantumide/common/quantumidePluginRegistry.js';
import product from '../../platform/product/common/product.js';
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from '../common/contributions.js';
import { ICodeEditorService } from '../../editor/browser/services/codeEditorService.js';
import { ICommandService } from '../../platform/commands/common/commands.js';
import { IQuantumIDEActiveEditorService } from '../services/quantumide/browser/quantumideActiveEditorService.js';
import { IQuantumIDEInlineDiffService } from '../services/quantumide/browser/quantumideInlineDiffService.js';
import { IQuantumIDEInlineEditorService } from '../services/quantumide/browser/quantumideInlineEditorService.js';
import { IQuantumIDEChatInThreadInjectService } from '../services/quantumide/common/quantumideChatInThreadInject.js';
import { IQuantumIDEChatInlineEditService } from '../services/quantumide/browser/quantumideChatInlineEditService.js';
import { IQuantumIDERefactorWorkflowService } from '../services/quantumide/common/quantumideRefactorWorkflow.js';
import { IQuantumIDEPluginSettingsService } from '../services/quantumide/browser/quantumidePluginSettingsService.js';
import { IQuantumIDEEditorStateService } from '../services/quantumide/browser/quantumideEditorStateService.js';
import { IQuantumIDEUnifiedEditPipelineService } from '../services/quantumide/common/quantumideUnifiedEditPipeline.js';
import { IQuantumIDEChatContextOrchestrator } from '../services/quantumide/common/quantumideChatContext.js';

function isQuantumIDE(): boolean {
	return isQuantumIDEProduct(product.applicationName)
		|| [product.nameShort, product.nameLong].some(n => typeof n === 'string' && n.toLowerCase().includes('quantumide'));
}

/** Step 1 — mirror inline diff state into chat for accept/reject. */
class QuantumIDEInlineChatBridgeContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.quantumideInlineChatBridge';

	constructor(
		@IQuantumIDEInlineDiffService inlineDiff: IQuantumIDEInlineDiffService,
		@IQuantumIDEChatInThreadInjectService inject: IQuantumIDEChatInThreadInjectService,
	) {
		super();
		if (!isQuantumIDE()) {
			return;
		}
		this._register(inlineDiff.onDidChangeProposal(() => {
			const proposal = inlineDiff.getActiveProposal();
			if (!proposal) {
				return;
			}
			const label = proposal.uri.path.split('/').pop() ?? proposal.uri.fsPath;
			inject.injectInlineSuggestionBar(label, inlineDiff.getHunks().length);
		}));
	}
}

/** Step 4 — register built-in and extension plugins in settings. */
class QuantumIDEPluginBootstrapContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.quantumidePluginBootstrap';

	constructor(
		@IQuantumIDEPluginSettingsService pluginSettings: IQuantumIDEPluginSettingsService,
	) {
		super();
		if (!isQuantumIDE()) {
			return;
		}
		for (const plugin of getQuantumIDEPlugins()) {
			pluginSettings.registerKnownPluginId(plugin.id);
		}
	}
}

/** Step 8 — refresh batch summary in chat when pending edits change. */
class QuantumIDEBatchReviewChatContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.quantumideBatchReviewChat';

	constructor(
		@IQuantumIDEChatInlineEditService edits: IQuantumIDEChatInlineEditService,
		@IQuantumIDEChatInThreadInjectService inject: IQuantumIDEChatInThreadInjectService,
	) {
		super();
		if (!isQuantumIDE()) {
			return;
		}
		let lastCount = 0;
		this._register(edits.onDidChangePending(() => {
			const pending = edits.getPendingEdits();
			if (pending.length === 0 || pending.length === lastCount) {
				lastCount = pending.length;
				return;
			}
			lastCount = pending.length;
			const batches = edits.getBatchIds();
			inject.injectBatchReviewSummary(batches.length, pending.length, pending.map(e => e.path));
		}));
	}
}

if (isQuantumIDE()) {
	registerWorkbenchContribution2(QuantumIDEInlineChatBridgeContribution.ID, QuantumIDEInlineChatBridgeContribution, WorkbenchPhase.AfterRestored);
	registerWorkbenchContribution2(QuantumIDEPluginBootstrapContribution.ID, QuantumIDEPluginBootstrapContribution, WorkbenchPhase.Eventually);
	registerWorkbenchContribution2(QuantumIDEBatchReviewChatContribution.ID, QuantumIDEBatchReviewChatContribution, WorkbenchPhase.AfterRestored);

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'quantumide.chat.insertAtCursor',
				title: localize2('quantumide.chat.insertAtCursor', 'QuantumIDE: Insert Text at Cursor'),
				category: { value: localize('quantumide.chatPanel', 'QuantumIDE Chat Panel'), original: 'QuantumIDE Chat Panel' },
				f1: true,
			});
		}
		override async run(accessor: ServicesAccessor): Promise<void> {
			const text = await accessor.get(IQuickInputService).input({ title: localize('quantumide.insertText', 'Text to insert') });
			if (!text) {
				return;
			}
			const result = accessor.get(IQuantumIDEActiveEditorService).editActiveEditor({ mode: 'insert_at_cursor', text });
			accessor.get(INotificationService).info(result.message);
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'quantumide.chat.replaceSelection',
				title: localize2('quantumide.chat.replaceSelection', 'QuantumIDE: Replace Selection from Chat'),
				category: { value: localize('quantumide.chatPanel', 'QuantumIDE Chat Panel'), original: 'QuantumIDE Chat Panel' },
				f1: true,
			});
		}
		override async run(accessor: ServicesAccessor): Promise<void> {
			const text = await accessor.get(IQuickInputService).input({ title: localize('quantumide.replaceText', 'Replacement text') });
			if (!text) {
				return;
			}
			const result = accessor.get(IQuantumIDEActiveEditorService).editActiveEditor({ mode: 'replace_selection', text });
			accessor.get(INotificationService).info(result.message);
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'quantumide.chat.showEditorContext',
				title: localize2('quantumide.chat.showEditorContext', 'QuantumIDE: Show Live Editor Context'),
				category: { value: localize('quantumide.chatPanel', 'QuantumIDE Chat Panel'), original: 'QuantumIDE Chat Panel' },
				f1: true,
			});
		}
		override async run(accessor: ServicesAccessor): Promise<void> {
			const state = accessor.get(IQuantumIDEEditorStateService).formatEditorStateForContext();
			const orchestrator = accessor.get(IQuantumIDEChatContextOrchestrator);
			const built = await orchestrator.buildChatContext({ includeOpenTabs: true, includeTerminal: true });
			accessor.get(INotificationService).info(
				(state ? state + '\n\n' : '') + built.slice(0, 6000),
			);
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'quantumide.chat.lspRefactorMenu',
				title: localize2('quantumide.chat.lspRefactorMenu', 'QuantumIDE: LSP Refactor from Chat'),
				category: { value: localize('quantumide.chatPanel', 'QuantumIDE Chat Panel'), original: 'QuantumIDE Chat Panel' },
				f1: true,
			});
		}
		override async run(accessor: ServicesAccessor): Promise<void> {
			const refactor = accessor.get(IQuantumIDERefactorWorkflowService);
			const codeEditor = accessor.get(ICodeEditorService);
			const hasSelection = !(codeEditor.getActiveCodeEditor()?.getSelection()?.isEmpty() ?? true);
			const actions = refactor.getAvailableRefactors(hasSelection, !!codeEditor.getActiveCodeEditor());
			const pick = await accessor.get(IQuickInputService).pick(
				actions.map(a => ({ label: a.label, description: a.description, id: a.id, command: a.command })),
				{ placeHolder: localize('quantumide.pickRefactor', 'Workspace refactor action') },
			);
			if (pick?.command) {
				refactor.recordRefactorRun(pick.id, pick.label);
				await accessor.get(ICommandService).executeCommand(pick.command);
			}
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'quantumide.chat.inlineSuggestSelection',
				title: localize2('quantumide.chat.inlineSuggestSelection', 'QuantumIDE: Inline Suggest for Selection'),
				category: { value: localize('quantumide.chatPanel', 'QuantumIDE Chat Panel'), original: 'QuantumIDE Chat Panel' },
				f1: true,
			});
		}
		override async run(accessor: ServicesAccessor): Promise<void> {
			const instruction = await accessor.get(IQuickInputService).input({
				title: localize('quantumide.inlineInstruction', 'Instruction for selection'),
				value: 'Improve this code',
			});
			if (!instruction) {
				return;
			}
			accessor.get(IQuantumIDEInlineEditorService).runInlinePrompt(instruction, { codeOnly: true });
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'quantumide.chat.openBatchReview',
				title: localize2('quantumide.chat.openBatchReview', 'QuantumIDE: Open Multi-File Batch Review'),
				category: { value: localize('quantumide.chatPanel', 'QuantumIDE Chat Panel'), original: 'QuantumIDE Chat Panel' },
				f1: true,
			});
		}
		override async run(accessor: ServicesAccessor): Promise<void> {
			const pipeline = accessor.get(IQuantumIDEUnifiedEditPipelineService);
			const inject = accessor.get(IQuantumIDEChatInThreadInjectService);
			const edits = accessor.get(IQuantumIDEChatInlineEditService).getPendingEdits();
			if (edits.length === 0) {
				accessor.get(INotificationService).info(localize('quantumide.noPending', 'No pending edits to review.'));
				return;
			}
			inject.injectBatchReviewSummary(
				accessor.get(IQuantumIDEChatInlineEditService).getBatchIds().length,
				edits.length,
				edits.map(e => e.path),
			);
			await accessor.get(ICommandService).executeCommand('quantumide.chat.openUnifiedReview');
			void pipeline;
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'quantumide.chat.previewRichBlock',
				title: localize2('quantumide.chat.previewRichBlock', 'QuantumIDE: Preview Code Block in Chat'),
				category: { value: localize('quantumide.chatPanel', 'QuantumIDE Chat Panel'), original: 'QuantumIDE Chat Panel' },
				f1: true,
			});
		}
		override async run(accessor: ServicesAccessor): Promise<void> {
			const code = await accessor.get(IQuickInputService).input({ title: localize('quantumide.code', 'Code') });
			if (!code) {
				return;
			}
			accessor.get(IQuantumIDEChatInThreadInjectService).injectRichCodePreview('typescript', code, 'Proposed change');
		}
	});
}
