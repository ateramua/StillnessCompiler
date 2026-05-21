/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../base/common/lifecycle.js';
import { localize, localize2 } from '../../nls.js';
import { Action2, registerAction2 } from '../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../platform/contextkey/common/contextkey.js';
import { IConfigurationService } from '../../platform/configuration/common/configuration.js';
import { ServicesAccessor } from '../../platform/instantiation/common/instantiation.js';
import { IQuickInputService } from '../../platform/quickinput/common/quickInput.js';
import { isQuantumIDEProduct } from '../../platform/quantumide/common/quantumideChatPlatform.js';
import { QuantumIDEAICommandId, QuantumIDEAISettingId } from '../../platform/quantumide/common/quantumideAISettings.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../common/contributions.js';
import product from '../../platform/product/common/product.js';
import { CodeAction } from '../../editor/common/languages.js';
import { CodeActionKind } from '../../editor/contrib/codeAction/common/types.js';
import { ILanguageFeaturesService } from '../../editor/common/services/languageFeatures.js';
import { Range } from '../../editor/common/core/range.js';
import { IWorkbenchContribution } from '../common/contributions.js';
import { IQuantumIDECollaborationService } from '../services/quantumide/common/quantumideCollaboration.js';
import { INotificationService } from '../../platform/notification/common/notification.js';
import { QuantumIDEChatParityToolsContribution } from '../contrib/chat/browser/tools/quantumideChatParityTools.js';

function isQuantumIDE(): boolean {
	return isQuantumIDEProduct(product.applicationName)
		|| [product.nameShort, product.nameLong].some(n => typeof n === 'string' && n.toLowerCase().includes('quantumide'));
}

class QuantumIDEInlineCodeActionsContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.quantumideInlineCodeActions';

	constructor(
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
	) {
		super();
		this._register(languageFeaturesService.codeActionProvider.register('*', {
			provideCodeActions: (model, range) => {
				if (!isQuantumIDE()) {
					return { actions: [], dispose: () => { } };
				}
				const selection = Range.lift(range);
				if (selection.isEmpty()) {
					return { actions: [], dispose: () => { } };
				}
				const selectedText = model.getValueInRange(selection);
				if (!selectedText.trim()) {
					return { actions: [], dispose: () => { } };
				}
				const actions: CodeAction[] = [
					{
						title: localize('quantumide.codeAction.explain', 'QuantumIDE: Explain selection'),
						kind: CodeActionKind.Source.value,
						command: { id: QuantumIDEAICommandId.InlineExplain, title: 'Explain' },
					},
					{
						title: localize('quantumide.codeAction.fix', 'QuantumIDE: Propose fix (inline diff)'),
						kind: CodeActionKind.QuickFix.value,
						command: { id: QuantumIDEAICommandId.InlineRefactor, title: 'Fix' },
					},
					{
						title: localize('quantumide.codeAction.optimize', 'QuantumIDE: Optimize selection'),
						kind: CodeActionKind.RefactorRewrite.value,
						command: { id: QuantumIDEAICommandId.InlineOptimize, title: 'Optimize' },
					},
					{
						title: localize('quantumide.codeAction.tests', 'QuantumIDE: Generate tests'),
						kind: CodeActionKind.RefactorRewrite.value,
						command: { id: QuantumIDEAICommandId.InlineGenerateTests, title: 'Tests' },
					},
				];
				return { actions, dispose: () => { } };
			},
		}));
	}
}

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: QuantumIDEAICommandId.ChatAttachFiles,
			title: localize2('quantumide.chat.attachFiles', 'QuantumIDE: Attach Files to Chat'),
			category: { value: localize('quantumide.ai.category', 'QuantumIDE AI'), original: 'QuantumIDE AI' },
			f1: true,
		});
	}
	override async run(accessor: ServicesAccessor): Promise<void> {
		accessor.get(INotificationService).info(
			localize('quantumide.chat.attachFiles.hint', 'Drag files into the chat input or use @ to reference files. Dropped images and workspace files are attached automatically.'),
		);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: QuantumIDEAICommandId.CollabStartSession,
			title: localize2('quantumide.collab.start', 'QuantumIDE: Start Collaboration Session'),
			category: { value: localize('quantumide.ai.category', 'QuantumIDE AI'), original: 'QuantumIDE AI' },
			f1: true,
			precondition: ContextKeyExpr.and(
				ContextKeyExpr.equals(`config.${QuantumIDEAISettingId.ChatCollabEnabled}`, true),
				ContextKeyExpr.equals(`config.${QuantumIDEAISettingId.ChatCollabExperimental}`, true),
			),
		});
	}
	override async run(accessor: ServicesAccessor): Promise<void> {
		const config = accessor.get(IConfigurationService);
		if (config.getValue<boolean>(QuantumIDEAISettingId.ChatCollabExperimental) !== true) {
			accessor.get(INotificationService).warn(
				localize('quantumide.collab.experimental', 'Collaboration is experimental (file + local broadcast sync only). Enable quantumide.chat.collab.experimental in settings.'),
			);
			return;
		}
		const collab = accessor.get(IQuantumIDECollaborationService);
		const quickInput = accessor.get(IQuickInputService);
		const name = await quickInput.input({
			title: localize('quantumide.collab.displayName', 'Your display name'),
			value: 'Developer',
		});
		if (!name) {
			return;
		}
		const session = await collab.startSession(name);
		accessor.get(INotificationService).info(
			localize('quantumide.collab.started', 'Experimental collaboration session started (local sync). Session id: {0}', session.sessionId),
		);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: QuantumIDEAICommandId.CollabJoinSession,
			title: localize2('quantumide.collab.join', 'QuantumIDE: Join Collaboration Session'),
			category: { value: localize('quantumide.ai.category', 'QuantumIDE AI'), original: 'QuantumIDE AI' },
			f1: true,
			precondition: ContextKeyExpr.and(
				ContextKeyExpr.equals(`config.${QuantumIDEAISettingId.ChatCollabEnabled}`, true),
				ContextKeyExpr.equals(`config.${QuantumIDEAISettingId.ChatCollabExperimental}`, true),
			),
		});
	}
	override async run(accessor: ServicesAccessor): Promise<void> {
		const config = accessor.get(IConfigurationService);
		if (config.getValue<boolean>(QuantumIDEAISettingId.ChatCollabExperimental) !== true) {
			accessor.get(INotificationService).warn(
				localize('quantumide.collab.experimental', 'Collaboration is experimental (file + local broadcast sync only). Enable quantumide.chat.collab.experimental in settings.'),
			);
			return;
		}
		const collab = accessor.get(IQuantumIDECollaborationService);
		const quickInput = accessor.get(IQuickInputService);
		const sessionId = await quickInput.input({ title: localize('quantumide.collab.sessionId', 'Session id') });
		const name = await quickInput.input({ title: localize('quantumide.collab.displayName', 'Your display name'), value: 'Developer' });
		if (!sessionId || !name) {
			return;
		}
		const session = await collab.joinSession(sessionId, name);
		if (!session) {
			accessor.get(INotificationService).warn(localize('quantumide.collab.notFound', 'Session not found.'));
			return;
		}
		accessor.get(INotificationService).info(localize('quantumide.collab.joined', 'Joined collaboration session.'));
	}
});

if (isQuantumIDE()) {
	registerWorkbenchContribution2(QuantumIDEChatParityToolsContribution.ID, QuantumIDEChatParityToolsContribution, WorkbenchPhase.BlockRestore);
	registerWorkbenchContribution2(QuantumIDEInlineCodeActionsContribution.ID, QuantumIDEInlineCodeActionsContribution, WorkbenchPhase.Eventually);
}
