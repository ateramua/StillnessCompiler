/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../platform/instantiation/common/instantiation.js';
import { IQuickInputService, IQuickPickItem } from '../../platform/quickinput/common/quickInput.js';
import { isQuantumIDEProduct } from '../../platform/quantumide/common/quantumideChatPlatform.js';
import { QuantumIDEAICommandId } from '../../platform/quantumide/common/quantumideAISettings.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../common/contributions.js';
import product from '../../platform/product/common/product.js';
import { INotificationService, Severity } from '../../platform/notification/common/notification.js';
import { IQuantumIDEOnboardingService } from '../services/quantumide/browser/quantumideOnboardingService.js';
import { IQuantumIDEFileNavigationService } from '../services/quantumide/browser/quantumideFileNavigationService.js';
import { IQuantumIDEChatEditSessionService } from '../services/quantumide/browser/quantumideChatEditSessionService.js';
import { QuantumIDEFeatureParityToolsContribution } from '../contrib/chat/browser/tools/quantumideFeatureParityTools.js';
import { ICommandService } from '../../platform/commands/common/commands.js';

function isQuantumIDE(): boolean {
	return isQuantumIDEProduct(product.applicationName)
		|| [product.nameShort, product.nameLong].some(n => typeof n === 'string' && n.toLowerCase().includes('quantumide'));
}

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: QuantumIDEAICommandId.ChatShowOnboarding,
			title: localize2('quantumide.chat.onboarding', 'QuantumIDE: Show Chat Onboarding'),
			category: { value: localize('quantumide.ai.category', 'QuantumIDE AI'), original: 'QuantumIDE AI' },
			f1: true,
		});
	}
	override run(accessor: ServicesAccessor): void {
		const onboarding = accessor.get(IQuantumIDEOnboardingService);
		accessor.get(INotificationService).info(onboarding.formatOnboardingMessage());
		onboarding.markOnboardingComplete();
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: QuantumIDEAICommandId.AcceptPendingBatchEdits,
			title: localize2('quantumide.chat.acceptBatch', 'QuantumIDE: Accept Pending Chat Batch'),
			f1: true,
		});
	}
	override async run(accessor: ServicesAccessor, batchId?: string): Promise<void> {
		if (!batchId) { return; }
		const edits = accessor.get(IQuantumIDEChatEditSessionService);
		const applied = await edits.acceptBatch(batchId);
		accessor.get(INotificationService).info(localize('quantumide.chat.acceptBatch.done', 'Applied {0} file edit(s) from batch.', applied));
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: QuantumIDEAICommandId.RejectPendingBatchEdits,
			title: localize2('quantumide.chat.rejectBatch', 'QuantumIDE: Reject Pending Chat Batch'),
			f1: true,
		});
	}
	override run(accessor: ServicesAccessor, batchId?: string): void {
		if (!batchId) { return; }
		accessor.get(IQuantumIDEChatEditSessionService).rejectBatch(batchId);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: QuantumIDEAICommandId.AcceptPendingEditById,
			title: localize2('quantumide.chat.acceptById', 'QuantumIDE: Accept Pending Chat Edit'),
			f1: false,
		});
	}
	override async run(accessor: ServicesAccessor, editId?: string): Promise<void> {
		if (!editId) { return; }
		await accessor.get(IQuantumIDEChatEditSessionService).acceptEditById(editId);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: QuantumIDEAICommandId.RejectPendingEditById,
			title: localize2('quantumide.chat.rejectById', 'QuantumIDE: Reject Pending Chat Edit'),
			f1: false,
		});
	}
	override run(accessor: ServicesAccessor, editId?: string): void {
		if (!editId) { return; }
		accessor.get(IQuantumIDEChatEditSessionService).rejectEditById(editId);
	}
});

function registerChatLspAction(opts: {
	id: QuantumIDEAICommandId;
	title: ReturnType<typeof localize2>;
	targetCommand: string;
	showInEditorContext?: boolean;
}): void {
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: opts.id,
				title: opts.title,
				f1: true,
				menu: opts.showInEditorContext ? {
					id: MenuId.EditorContext,
					group: 'navigation',
				} : undefined,
			});
		}
		override run(accessor: ServicesAccessor): Promise<unknown> {
			return accessor.get(ICommandService).executeCommand(opts.targetCommand);
		}
	});
}

registerChatLspAction({
	id: QuantumIDEAICommandId.ChatLspGotoWorkspaceSymbol,
	title: localize2('quantumide.chat.lsp.gotoWorkspaceSymbol', 'QuantumIDE: LSP Go to Workspace Symbol'),
	targetCommand: 'workbench.action.gotoSymbol',
	showInEditorContext: true,
});
registerChatLspAction({
	id: QuantumIDEAICommandId.ChatLspGotoDefinition,
	title: localize2('quantumide.chat.lsp.gotoDefinition', 'QuantumIDE: LSP Go to Definition'),
	targetCommand: 'editor.action.revealDefinition',
	showInEditorContext: true,
});
registerChatLspAction({
	id: QuantumIDEAICommandId.ChatLspGotoReferences,
	title: localize2('quantumide.chat.lsp.gotoReferences', 'QuantumIDE: LSP Go to References'),
	targetCommand: 'editor.action.goToReferences',
	showInEditorContext: true,
});
registerChatLspAction({
	id: QuantumIDEAICommandId.ChatLspRenameSymbol,
	title: localize2('quantumide.chat.lsp.renameSymbol', 'QuantumIDE: LSP Rename Symbol'),
	targetCommand: 'editor.action.rename',
	showInEditorContext: true,
});
registerChatLspAction({
	id: QuantumIDEAICommandId.ChatLspRefactor,
	title: localize2('quantumide.chat.lsp.refactor', 'QuantumIDE: LSP Refactor'),
	targetCommand: 'editor.action.refactor',
	showInEditorContext: true,
});
registerChatLspAction({
	id: QuantumIDEAICommandId.ChatLspQuickFix,
	title: localize2('quantumide.chat.lsp.quickFix', 'QuantumIDE: LSP Quick Fix'),
	targetCommand: 'editor.action.quickFix',
	showInEditorContext: true,
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'quantumide.chat.askAboutCode',
			title: localize2('quantumide.chat.askAboutCode', 'QuantumIDE: Ask about this code'),
			f1: true,
			menu: {
				id: MenuId.EditorContext,
				group: 'navigation',
				when: ContextKeyExpr.has('editorHasSelection'),
			},
		});
	}
	override run(accessor: ServicesAccessor): Promise<unknown> {
		return accessor.get(ICommandService).executeCommand(QuantumIDEAICommandId.ExplainSelection);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'quantumide.chat.explainSelectionContext',
			title: localize2('quantumide.chat.explainSelectionContext', 'QuantumIDE: Explain this'),
			f1: false,
			menu: {
				id: MenuId.EditorContext,
				group: 'navigation',
				when: ContextKeyExpr.has('editorHasSelection'),
			},
		});
	}
	override run(accessor: ServicesAccessor): Promise<unknown> {
		return accessor.get(ICommandService).executeCommand(QuantumIDEAICommandId.ExplainSelection);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'quantumide.chat.findUsagesContext',
			title: localize2('quantumide.chat.findUsagesContext', 'QuantumIDE: Find usages'),
			f1: false,
			menu: {
				id: MenuId.EditorContext,
				group: 'navigation',
			},
		});
	}
	override run(accessor: ServicesAccessor): Promise<unknown> {
		return accessor.get(ICommandService).executeCommand(QuantumIDEAICommandId.ChatLspGotoReferences);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'quantumide.chat.refactorContext',
			title: localize2('quantumide.chat.refactorContext', 'QuantumIDE: Refactor'),
			f1: false,
			menu: {
				id: MenuId.EditorContext,
				group: 'navigation',
			},
		});
	}
	override run(accessor: ServicesAccessor): Promise<unknown> {
		return accessor.get(ICommandService).executeCommand(QuantumIDEAICommandId.ChatLspRefactor);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'quantumide.chat.generateDocstringContext',
			title: localize2('quantumide.chat.generateDocstringContext', 'QuantumIDE: Generate docstring'),
			f1: false,
			menu: {
				id: MenuId.EditorContext,
				group: 'navigation',
				when: ContextKeyExpr.has('editorHasSelection'),
			},
		});
	}
	override run(accessor: ServicesAccessor): Promise<unknown> {
		return accessor.get(ICommandService).executeCommand(QuantumIDEAICommandId.InlineAddDocs);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: QuantumIDEAICommandId.BrowseWorkspaceTree,
			title: localize2('quantumide.chat.browseTree', 'QuantumIDE: Browse Workspace in Chat'),
			category: { value: localize('quantumide.ai.category', 'QuantumIDE AI'), original: 'QuantumIDE AI' },
			f1: true,
		});
	}
	override async run(accessor: ServicesAccessor): Promise<void> {
		const nav = accessor.get(IQuantumIDEFileNavigationService);
		const quickInput = accessor.get(IQuickInputService);
		const entries = await nav.listWorkspaceTree(300);
		const pick = await quickInput.pick(
			entries.map(e => ({
				label: e.isDirectory ? `$(folder) ${e.path}` : `$(file) ${e.path}`,
				path: e.path,
			} satisfies IQuickPickItem & { path: string })),
			{ placeHolder: localize('quantumide.chat.pickFile', 'Select a file to open') },
		);
		if (pick && 'path' in pick) {
			await nav.openFile((pick as { path: string }).path);
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: QuantumIDEAICommandId.AcceptPendingChatEdits,
			title: localize2('quantumide.chat.acceptEdits', 'QuantumIDE: Accept Pending Chat Edits'),
			category: { value: localize('quantumide.ai.category', 'QuantumIDE AI'), original: 'QuantumIDE AI' },
			f1: true,
		});
	}
	override async run(accessor: ServicesAccessor): Promise<void> {
		const edits = accessor.get(IQuantumIDEChatEditSessionService);
		const result = await edits.acceptAll();
		accessor.get(INotificationService).info(localize('quantumide.chat.acceptedEdits', 'Applied {0} pending chat edit(s).', result.applied));
	}
});

class QuantumIDEOnboardingStartupContribution {
	constructor(
		@IQuantumIDEOnboardingService private readonly _onboarding: IQuantumIDEOnboardingService,
		@INotificationService private readonly _notifications: INotificationService,
	) {
		if (!this._onboarding.hasCompletedOnboarding()) {
			this._notifications.prompt(
				Severity.Info,
				localize('quantumide.chat.onboardingPrompt', 'New to QuantumIDE chat? Run "QuantumIDE: Show Chat Onboarding" for a guided tour.'),
				[{
					label: localize('quantumide.chat.showGuide', 'Show guide'),
					run: () => {
						this._notifications.info(this._onboarding.formatOnboardingMessage());
						this._onboarding.markOnboardingComplete();
					},
				}],
			);
		}
	}
}

if (isQuantumIDE()) {
	registerWorkbenchContribution2(QuantumIDEFeatureParityToolsContribution.ID, QuantumIDEFeatureParityToolsContribution, WorkbenchPhase.BlockRestore);
	registerWorkbenchContribution2('workbench.contrib.quantumideOnboardingStartup', QuantumIDEOnboardingStartupContribution, WorkbenchPhase.Eventually);
}
