/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../base/common/lifecycle.js';
import { localize, localize2 } from '../../nls.js';
import { Action2, registerAction2 } from '../../platform/actions/common/actions.js';
import { ICommandService } from '../../platform/commands/common/commands.js';
import { ServicesAccessor } from '../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../platform/notification/common/notification.js';
import { IQuickInputService } from '../../platform/quickinput/common/quickInput.js';
import { isQuantumIDEProduct } from '../../platform/quantumide/common/quantumideChatPlatform.js';
import product from '../../platform/product/common/product.js';
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from '../common/contributions.js';
import { IQuantumIDEExecutionGraphService } from '../services/quantumide/common/quantumideExecutionGraph.js';
import { IQuantumIDEChatInThreadInjectService } from '../services/quantumide/common/quantumideChatInThreadInject.js';
import { IQuantumIDEChatEditSessionService } from '../services/quantumide/browser/quantumideChatEditSessionService.js';
import { IQuantumIDEUnifiedSearchService } from '../services/quantumide/common/quantumidePlatformOps.js';
import { IQuantumIDEFileNavigationService } from '../services/quantumide/browser/quantumideFileNavigationService.js';
import { IQuantumIDEChatTestPanelService } from '../services/quantumide/common/quantumideChatTestPanel.js';
import { IQuantumIDETerminalBlockService } from '../services/quantumide/common/quantumideTerminalBlock.js';
import { IQuantumIDEWorkspaceSnapshotService } from '../services/quantumide/common/quantumideWorkspaceSnapshot.js';
import { basename } from '../../base/common/path.js';
import { parseQuantumIDETestOutput } from '../../platform/quantumide/common/quantumideTestResultParser.js';
import { ICodeEditorService } from '../../editor/browser/services/codeEditorService.js';
import { IEditorService } from '../services/editor/common/editorService.js';
import { IChatWidgetService } from '../contrib/chat/browser/chat.js';
import { chatVariableLeader } from '../contrib/chat/common/requestParser/chatParserTypes.js';
import type { IQuantumIDEChatTestResultItem } from '../services/quantumide/common/quantumideChatTestPanel.js';

function isQuantumIDE(): boolean {
	return isQuantumIDEProduct(product.applicationName)
		|| [product.nameShort, product.nameLong].some(n => typeof n === 'string' && n.toLowerCase().includes('quantumide'));
}

class QuantumIDEExecutionGraphChatContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.quantumideExecutionGraphChat';

	constructor(
		@IQuantumIDEExecutionGraphService graph: IQuantumIDEExecutionGraphService,
		@IQuantumIDEChatInThreadInjectService inject: IQuantumIDEChatInThreadInjectService,
	) {
		super();
		if (!isQuantumIDE()) {
			return;
		}
		this._register(graph.onDidChange(() => {
			const checklist = graph.formatChecklist();
			if (checklist) {
				inject.injectExecutionGraphChecklist(checklist);
			}
		}));
	}
}

if (isQuantumIDE()) {
	registerWorkbenchContribution2(QuantumIDEExecutionGraphChatContribution.ID, QuantumIDEExecutionGraphChatContribution, WorkbenchPhase.AfterRestored);

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'quantumide.search.openHit',
				title: localize2('quantumide.search.openHit', 'QuantumIDE: Open Search Hit'),
				category: { value: localize('quantumide.nextBatch', 'QuantumIDE Next Batch'), original: 'QuantumIDE Next Batch' },
			});
		}
		override async run(accessor: ServicesAccessor, hit?: { path: string; line?: number }): Promise<void> {
			if (!hit?.path) {
				return;
			}
			await accessor.get(IQuantumIDEFileNavigationService).goToLine(hit.path, hit.line ?? 1);
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'quantumide.chat.searchWithPreview',
				title: localize2('quantumide.chat.searchWithPreview', 'QuantumIDE: Search Codebase (Preview)'),
				category: { value: localize('quantumide.nextBatch', 'QuantumIDE Next Batch'), original: 'QuantumIDE Next Batch' },
				f1: true,
			});
		}
		override async run(accessor: ServicesAccessor): Promise<void> {
			const q = await accessor.get(IQuickInputService).input({ title: localize('quantumide.search', 'Search query') });
			if (!q) {
				return;
			}
			const hits = await accessor.get(IQuantumIDEUnifiedSearchService).search(q, 25);
			const picked = await accessor.get(IQuickInputService).pick(
				hits.map(h => ({
					label: h.label,
					description: h.signature ?? h.detail,
					detail: `${h.path}${h.line ? `:${h.line}` : ''}`,
					hit: h,
				})),
				{ placeHolder: localize('quantumide.pickHit', 'Open result at definition') },
			);
			if (picked?.hit) {
				await accessor.get(IQuantumIDEFileNavigationService).goToLine(picked.hit.path, picked.hit.line ?? 1);
			}
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'quantumide.chat.rollbackLastBatch',
				title: localize2('quantumide.chat.rollbackLastBatch', 'QuantumIDE: Rollback Last Edit Batch'),
				category: { value: localize('quantumide.nextBatch', 'QuantumIDE Next Batch'), original: 'QuantumIDE Next Batch' },
				f1: true,
			});
		}
		override async run(accessor: ServicesAccessor): Promise<void> {
			const ok = await accessor.get(IQuantumIDEChatEditSessionService).rollbackLastBatch();
			accessor.get(INotificationService).info(ok
				? localize('quantumide.rollback.ok', 'Last edit batch rolled back.')
				: localize('quantumide.rollback.none', 'No batch to roll back.'));
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'quantumide.chat.restoreCheckpoint',
				title: localize2('quantumide.chat.restoreCheckpoint', 'QuantumIDE: Restore Workspace Checkpoint'),
				category: { value: localize('quantumide.nextBatch', 'QuantumIDE Next Batch'), original: 'QuantumIDE Next Batch' },
				f1: true,
			});
		}
		override async run(accessor: ServicesAccessor): Promise<void> {
			const snaps = await accessor.get(IQuantumIDEWorkspaceSnapshotService).listSnapshots();
			if (snaps.length === 0) {
				accessor.get(INotificationService).warn(localize('quantumide.noSnapshots', 'No checkpoints available.'));
				return;
			}
			const pick = await accessor.get(IQuickInputService).pick(
				snaps.map(s => ({ label: s.label, description: new Date(s.createdAt).toLocaleString(), id: s.id })),
				{ placeHolder: localize('quantumide.pickSnapshot', 'Choose checkpoint') },
			);
			if (pick) {
				const result = await accessor.get(IQuantumIDEWorkspaceSnapshotService).restoreSnapshot(pick.id);
				if (result.ok) {
					accessor.get(INotificationService).info(localize('quantumide.restored', 'Checkpoint restored.'));
				} else {
					accessor.get(INotificationService).error(result.error ?? localize('quantumide.restoreFailed', 'Restore failed.'));
				}
			}
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'quantumide.chat.runWorkspaceTests',
				title: localize2('quantumide.chat.runWorkspaceTests', 'QuantumIDE: Run Workspace Tests'),
				category: { value: localize('quantumide.nextBatch', 'QuantumIDE Next Batch'), original: 'QuantumIDE Next Batch' },
				f1: true,
			});
		}
		override async run(accessor: ServicesAccessor): Promise<void> {
			const commands = accessor.get(ICommandService);
			await commands.executeCommand('testing.runAll');
			const panel = accessor.get(IQuantumIDEChatTestPanelService);
			panel.refreshFromNativeResults();
			const run = panel.getLatestRun();
			const detail = run
				? formatTestRunDetail(run.items)
				: 'Test run started — open Testing view for live output.';
			const parsed = parseQuantumIDETestOutput(detail);
			accessor.get(IQuantumIDETerminalBlockService).recordTestOutput(
				run ? `passed: ${run.passed}, failed: ${run.failed}\n${detail}` : detail || parsed.summary,
			);
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'quantumide.chat.runSingleTest',
				title: localize2('quantumide.chat.runSingleTest', 'QuantumIDE: Run Single Test'),
				category: { value: localize('quantumide.nextBatch', 'QuantumIDE Next Batch'), original: 'QuantumIDE Next Batch' },
				f1: true,
			});
		}
		override async run(accessor: ServicesAccessor): Promise<void> {
			const panel = accessor.get(IQuantumIDEChatTestPanelService);
			panel.refreshFromNativeResults();
			const run = panel.getLatestRun();
			const items = run?.items ?? [];
			if (items.length === 0) {
				accessor.get(INotificationService).warn(localize('quantumide.noTests', 'No tests discovered. Run tests from the Testing view first.'));
				return;
			}
			const pick = await accessor.get(IQuickInputService).pick(
				items.map(t => ({ label: t.label, description: t.state, id: t.id })),
				{ placeHolder: localize('quantumide.pickTest', 'Test to run') },
			);
			if (!pick) {
				return;
			}
			await accessor.get(ICommandService).executeCommand('testing.run.uri', items.find(t => t.id === pick.id)?.uri);
			panel.refreshFromNativeResults();
			const item = items.find(t => t.id === pick.id);
			const detail = item ? `${item.state} ${item.label}` : '';
			const parsed = parseQuantumIDETestOutput(detail);
			accessor.get(IQuantumIDETerminalBlockService).recordTestOutput(detail || parsed.summary);
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'quantumide.chat.attachActiveEditor',
				title: localize2('quantumide.chat.attachActiveEditor', 'QuantumIDE: Attach Active File to Chat'),
				category: { value: localize('quantumide.nextBatch', 'QuantumIDE Next Batch'), original: 'QuantumIDE Next Batch' },
				f1: true,
			});
		}
		override run(accessor: ServicesAccessor): void {
			const uri = accessor.get(IEditorService).activeEditor?.resource
				?? accessor.get(ICodeEditorService).getActiveCodeEditor()?.getModel()?.uri;
			const widget = accessor.get(IChatWidgetService).getAllWidgets().find(w => !!w.viewModel?.sessionResource)
				?? accessor.get(IChatWidgetService).getAllWidgets()[0];
			if (!uri || !widget?.viewModel?.sessionResource) {
				accessor.get(INotificationService).info(localize('quantumide.noActiveFile', 'Open a file to attach as context.'));
				return;
			}
			const text = `${chatVariableLeader}file:${basename(uri.fsPath)}`;
			void accessor.get(ICommandService).executeCommand('quantumide.chat.insertAttachment', {
				sessionResource: widget.viewModel.sessionResource.toString(),
				variable: {
					id: uri.toString(),
					range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: text.length + 1 },
					fullName: basename(uri.fsPath),
					isFile: true,
					data: uri,
				},
			});
		}
	});
}

function formatTestRunDetail(items: readonly IQuantumIDEChatTestResultItem[]): string {
	return items.map(i => `${i.state} ${i.label}${i.message ? ': ' + i.message : ''}`).join('\n');
}
