/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../base/common/codicons.js';
import { Disposable } from '../../base/common/lifecycle.js';
import { localize, localize2 } from '../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../platform/configuration/common/configuration.js';
import { ServicesAccessor } from '../../platform/instantiation/common/instantiation.js';
import { INotificationService, Severity } from '../../platform/notification/common/notification.js';
import { IQuickInputService } from '../../platform/quickinput/common/quickInput.js';
import { isQuantumIDEProduct } from '../../platform/quantumide/common/quantumideChatPlatform.js';
import { QuantumIDEAICommandId, QuantumIDEAISettingId } from '../../platform/quantumide/common/quantumideAISettings.js';
import { getQuantumIDEPlugins } from '../../platform/quantumide/common/quantumidePluginRegistry.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../common/contributions.js';
import product from '../../platform/product/common/product.js';
import { ICodeBlockActionContext } from '../contrib/chat/browser/widget/chatContentParts/codeBlockPart.js';
import { isCodeBlockActionContext } from '../contrib/chat/browser/actions/chatCodeblockActions.js';
import { ChatContextKeys } from '../contrib/chat/common/actions/chatContextKeys.js';
import { IQuantumIDEActiveEditorService } from '../services/quantumide/browser/quantumideActiveEditorService.js';
import { IQuantumIDEChatContextOrchestrator } from '../services/quantumide/common/quantumideChatContext.js';
import { IQuantumIDEChatEditSessionService } from '../services/quantumide/browser/quantumideChatEditSessionService.js';
import { IQuantumIDEReplSessionService } from '../services/quantumide/browser/quantumideReplSessionService.js';
import { IQuantumIDEOnboardingService } from '../services/quantumide/browser/quantumideOnboardingService.js';
import { IQuantumIDEPluginSettingsService } from '../services/quantumide/browser/quantumidePluginSettingsService.js';
import { QuantumIDECursorLevelToolsContribution } from '../contrib/chat/browser/tools/quantumideCursorLevelTools.js';
import { IMarkerService, MarkerSeverity } from '../../platform/markers/common/markers.js';
import { IWorkspaceContextService } from '../../platform/workspace/common/workspace.js';
import { IEditorService } from '../services/editor/common/editorService.js';
import { ICodeEditorService } from '../../editor/browser/services/codeEditorService.js';
import { IQuantumIDEInlineEditorService } from '../services/quantumide/browser/quantumideInlineEditorService.js';

const RUN_CODE_BLOCK_ID = 'quantumide.chat.runCodeBlock';
const APPLY_CODE_BLOCK_ID = 'quantumide.chat.applyCodeToEditor';

function isQuantumIDE(): boolean {
	return isQuantumIDEProduct(product.applicationName)
		|| [product.nameShort, product.nameLong].some(n => typeof n === 'string' && n.toLowerCase().includes('quantumide'));
}

function getCodeBlockContext(args: unknown[]): ICodeBlockActionContext | undefined {
	const context = args[0];
	return isCodeBlockActionContext(context) ? context : undefined;
}

function resolveRunCodeBlockPayload(args: unknown[]): { languageId: string; code: string } | undefined {
	const ctx = getCodeBlockContext(args);
	if (ctx?.code?.trim()) {
		return { languageId: ctx.languageId ?? 'javascript', code: ctx.code };
	}
	const raw = args[0];
	if (typeof raw === 'string' && raw.trim()) {
		try {
			const decoded = decodeURIComponent(raw);
			const parsed = JSON.parse(decoded) as unknown;
			if (Array.isArray(parsed) && typeof parsed[1] === 'string') {
				return { languageId: String(parsed[0] ?? 'javascript'), code: parsed[1] };
			}
		} catch {
			// ignore malformed command args
		}
	}
	return undefined;
}

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: RUN_CODE_BLOCK_ID,
			title: localize2('quantumide.chat.runCodeBlock', 'Run with QuantumIDE'),
			icon: Codicon.play,
			category: { value: localize('quantumide.ai.category', 'QuantumIDE AI'), original: 'QuantumIDE AI' },
			precondition: ChatContextKeys.enabled,
			menu: {
				id: MenuId.ChatCodeBlock,
				group: 'navigation',
				order: 5,
				when: undefined,
			},
			f1: true,
		});
	}
	override async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
		if (!isQuantumIDE()) {
			return;
		}
		let payload = resolveRunCodeBlockPayload(args);
		if (!payload?.code.trim()) {
			const quick = accessor.get(IQuickInputService);
			const code = await quick.input({ title: localize('quantumide.runBlock', 'Paste code to run') });
			if (!code?.trim()) {
				return;
			}
			const lang = await quick.input({ title: localize('quantumide.runBlockLang', 'Language (optional)'), value: 'javascript' });
			payload = { languageId: lang || 'javascript', code };
		}
		const live = accessor.get(IQuantumIDEReplSessionService);
		const notifications = accessor.get(INotificationService);
		const result = await live.runInSession(payload.languageId, payload.code);
		const severity = /error|fail|exception/i.test(result.formatted) ? Severity.Warning : Severity.Info;
		notifications.notify({
			severity,
			message: result.formatted.slice(0, 8000),
		});
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: APPLY_CODE_BLOCK_ID,
			title: localize2('quantumide.chat.applyCodeToEditor', 'Apply to Active Editor'),
			icon: Codicon.insert,
			category: { value: localize('quantumide.ai.category', 'QuantumIDE AI'), original: 'QuantumIDE AI' },
			precondition: ChatContextKeys.enabled,
			menu: {
				id: MenuId.ChatCodeBlock,
				group: 'navigation',
				order: 6,
			},
			f1: false,
		});
	}
	override run(accessor: ServicesAccessor, ...args: unknown[]): void {
		if (!isQuantumIDE()) {
			return;
		}
		const ctx = getCodeBlockContext(args);
		if (!ctx?.code) {
			return;
		}
		const codeEditor = accessor.get(ICodeEditorService);
		const editor = accessor.get(IQuantumIDEActiveEditorService);
		const selection = codeEditor.getActiveCodeEditor()?.getSelection();
		const mode = selection && !selection.isEmpty() ? 'replace_selection' as const : 'insert_at_cursor' as const;
		const result = editor.editActiveEditor({ mode, text: ctx.code });
		accessor.get(INotificationService).notify({
			severity: result.applied ? Severity.Info : Severity.Warning,
			message: result.message,
		});
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: QuantumIDEAICommandId.ChatContextInspector,
			title: localize2('quantumide.chat.contextInspector', 'QuantumIDE: Show Agent Context Inspector'),
			category: { value: localize('quantumide.ai.category', 'QuantumIDE AI'), original: 'QuantumIDE AI' },
			f1: true,
		});
	}
	override async run(accessor: ServicesAccessor): Promise<void> {
		const orchestrator = accessor.get(IQuantumIDEChatContextOrchestrator);
		const body = await orchestrator.buildChatContext({ includeOpenTabs: true, includeTerminal: true });
		accessor.get(INotificationService).info(`${localize('quantumide.chat.contextInspectorTitle', 'Agent context (next message)')}\n\n${body.slice(0, 12000)}`);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: QuantumIDEAICommandId.ChatReviewPendingEdits,
			title: localize2('quantumide.chat.reviewPending', 'QuantumIDE: Review Pending Chat Edits'),
			category: { value: localize('quantumide.ai.category', 'QuantumIDE AI'), original: 'QuantumIDE AI' },
			f1: true,
		});
	}
	override async run(accessor: ServicesAccessor): Promise<void> {
		const session = accessor.get(IQuantumIDEChatEditSessionService);
		const quickInput = accessor.get(IQuickInputService);
		const count = session.getPendingCount();
		if (count === 0) {
			accessor.get(INotificationService).info(localize('quantumide.chat.noPending', 'No pending chat edits.'));
			return;
		}
		const pick = await quickInput.pick([
			{ label: localize('quantumide.chat.acceptAll', 'Accept all ({0})', count), id: 'accept' },
			{ label: localize('quantumide.chat.rejectAll', 'Reject all'), id: 'reject' },
			{ label: localize('quantumide.chat.rollback', 'Rollback last applied batch'), id: 'rollback' },
		], { placeHolder: localize('quantumide.chat.reviewPlace', 'Review pending file edits from chat') });
		if (!pick || !('id' in pick)) {
			return;
		}
		if (pick.id === 'accept') {
			const r = await session.acceptAll();
			accessor.get(INotificationService).info(localize('quantumide.chat.accepted', 'Applied {0} edit(s).', r.applied));
		} else if (pick.id === 'reject') {
			session.rejectAll();
		} else if (pick.id === 'rollback') {
			const ok = await session.rollbackLastBatch();
			accessor.get(INotificationService).notify({
				severity: ok ? Severity.Info : Severity.Warning,
				message: ok ? localize('quantumide.chat.rolledBack', 'Rolled back last batch.') : localize('quantumide.chat.rollbackFailed', 'Rollback failed.'),
			});
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: QuantumIDEAICommandId.ManagePlugins,
			title: localize2('quantumide.plugins.manage', 'QuantumIDE: Manage Plugins'),
			category: { value: localize('quantumide.ai.category', 'QuantumIDE AI'), original: 'QuantumIDE AI' },
			f1: true,
		});
	}
	override async run(accessor: ServicesAccessor): Promise<void> {
		const settings = accessor.get(IQuantumIDEPluginSettingsService);
		const quickInput = accessor.get(IQuickInputService);
		for (const plugin of getQuantumIDEPlugins()) {
			settings.registerKnownPluginId(plugin.id);
		}
		const enablement = settings.getEnablement();
		const items = getQuantumIDEPlugins().map(p => ({
			label: p.id,
			description: enablement.enabledPluginIds.length === 0 || enablement.enabledPluginIds.includes(p.id)
				? localize('quantumide.plugins.enabled', 'Enabled')
				: localize('quantumide.plugins.disabled', 'Disabled'),
			pluginId: p.id,
			picked: enablement.enabledPluginIds.length === 0 || enablement.enabledPluginIds.includes(p.id),
		}));
		const picked = await quickInput.pick(items, {
			canPickMany: true,
			placeHolder: localize('quantumide.plugins.pick', 'Enable QuantumIDE plugins for this session'),
		});
		if (!picked) {
			return;
		}
		const enabled = new Set(picked.filter(p => 'pluginId' in p).map(p => (p as { pluginId: string }).pluginId));
		for (const plugin of getQuantumIDEPlugins()) {
			settings.setPluginEnabled(plugin.id, enabled.has(plugin.id));
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: QuantumIDEAICommandId.ChatFixDiagnosticsInFile,
			title: localize2('quantumide.chat.fixDiagnostics', 'QuantumIDE: Fix Diagnostics in Active File'),
			category: { value: localize('quantumide.ai.category', 'QuantumIDE AI'), original: 'QuantumIDE AI' },
			f1: true,
		});
	}
	override run(accessor: ServicesAccessor): void {
		const markers = accessor.get(IMarkerService);
		const workspace = accessor.get(IWorkspaceContextService);
		const editorService = accessor.get(IEditorService);
		const codeEditor = accessor.get(ICodeEditorService);
		const resource = editorService.activeEditor?.resource ?? codeEditor.getActiveCodeEditor()?.getModel()?.uri;
		if (!resource) {
			return;
		}
		const issues = markers.read({ resource, severities: MarkerSeverity.Error | MarkerSeverity.Warning })
			.slice(0, 12)
			.map(m => `Line ${m.startLineNumber}: ${m.message}`);
		if (issues.length === 0) {
			accessor.get(INotificationService).info(localize('quantumide.chat.noDiagnostics', 'No diagnostics in active file.'));
			return;
		}
		const rel = workspace.getWorkspaceFolder(resource)?.name ?? resource.fsPath;
		accessor.get(IQuantumIDEInlineEditorService).runInlinePrompt(
			`Fix the following diagnostics in ${rel}:\n${issues.join('\n')}\nApply minimal edits.`,
			{ codeOnly: true },
		);
	}
});

class QuantumIDEOnboardingWalkthroughContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.quantumideOnboardingWalkthrough';

	constructor(
		@IQuantumIDEOnboardingService private readonly _onboarding: IQuantumIDEOnboardingService,
		@INotificationService private readonly _notifications: INotificationService,
		@IConfigurationService private readonly _configuration: IConfigurationService,
	) {
		super();
		if (!isQuantumIDE() || this._onboarding.hasCompletedOnboarding()) {
			return;
		}
		if (this._configuration.getValue<boolean>(QuantumIDEAISettingId.ChatFeatureParityEnabled) === false) {
			return;
		}
		const tips = this._onboarding.getTips();
		let step = 0;
		const showNext = () => {
			if (step >= tips.length) {
				this._onboarding.markOnboardingComplete();
				return;
			}
			const tip = tips[step++];
			this._notifications.prompt(
				Severity.Info,
				`${tip.title} (${step}/${tips.length})\n\n${tip.body}`,
				[{
					label: localize('quantumide.onboarding.next', 'Next tip'),
					run: () => showNext(),
				}, {
					label: localize('quantumide.onboarding.done', 'Done'),
					run: () => this._onboarding.markOnboardingComplete(),
				}],
			);
		};
		showNext();
	}
}

registerWorkbenchContribution2(QuantumIDECursorLevelToolsContribution.ID, QuantumIDECursorLevelToolsContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(QuantumIDEOnboardingWalkthroughContribution.ID, QuantumIDEOnboardingWalkthroughContribution, WorkbenchPhase.Eventually);
