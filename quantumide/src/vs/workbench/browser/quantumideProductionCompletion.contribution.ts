/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../base/common/lifecycle.js';
import { localize, localize2 } from '../../nls.js';
import { Action2, registerAction2 } from '../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../platform/instantiation/common/instantiation.js';
import { ICommandService } from '../../platform/commands/common/commands.js';
import { INotificationService } from '../../platform/notification/common/notification.js';
import { IQuickInputService } from '../../platform/quickinput/common/quickInput.js';
import { IFileDialogService } from '../../platform/dialogs/common/dialogs.js';
import { VSBuffer } from '../../base/common/buffer.js';
import { IFileService } from '../../platform/files/common/files.js';
import { isQuantumIDEProduct } from '../../platform/quantumide/common/quantumideChatPlatform.js';
import { QuantumIDEAICommandId } from '../../platform/quantumide/common/quantumideAISettings.js';
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from '../common/contributions.js';
import product from '../../platform/product/common/product.js';
import { IQuantumIDEUnifiedSearchService, IQuantumIDETelemetryService } from '../services/quantumide/common/quantumidePlatformOps.js';
import { IQuantumIDEWorkspaceSnapshotService } from '../services/quantumide/common/quantumideWorkspaceSnapshot.js';
import { IQuantumIDEChatThreadStoreService } from '../services/quantumide/common/quantumideChatThreadStore.js';
import { IQuantumIDECollaborationService } from '../services/quantumide/common/quantumideCollaboration.js';
import { IQuantumIDEErrorRecoveryService } from '../services/quantumide/common/quantumideErrorRecovery.js';
import { IQuantumIDEContextInspectorService } from '../services/quantumide/common/quantumideContextInspector.js';
import { IQuantumIDEFileNavigationService } from '../services/quantumide/browser/quantumideFileNavigationService.js';
import { IQuantumIDEAgentTaskOrchestratorService } from '../services/quantumide/common/quantumideAgentTask.js';
import { ITerminalService } from '../contrib/terminal/browser/terminal.js';
import { IQuantumIDECommandAuditService } from '../services/quantumide/browser/quantumideCommandAuditService.js';

function isQuantumIDE(): boolean {
	return isQuantumIDEProduct(product.applicationName)
		|| [product.nameShort, product.nameLong].some(n => typeof n === 'string' && n.toLowerCase().includes('quantumide'));
}

class QuantumIDEErrorBoundaryContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.quantumideErrorBoundary';

	constructor(
		@IQuantumIDEErrorRecoveryService private readonly _errors: IQuantumIDEErrorRecoveryService,
	) {
		super();
		if (!isQuantumIDE() || typeof window === 'undefined') {
			return;
		}
		const onError = (event: ErrorEvent) => {
			this._errors.report({
				id: `window-${Date.now()}`,
				message: event.message || 'Unhandled error',
				recoverable: false,
			});
		};
		const onRejection = (event: PromiseRejectionEvent) => {
			const reason = event.reason instanceof Error ? event.reason.message : String(event.reason);
			this._errors.report({
				id: `promise-${Date.now()}`,
				message: reason,
				recoverable: false,
			});
		};
		window.addEventListener('error', onError);
		window.addEventListener('unhandledrejection', onRejection);
		this._register({ dispose: () => { window.removeEventListener('error', onError); window.removeEventListener('unhandledrejection', onRejection); } });
	}
}

if (isQuantumIDE()) {
	registerWorkbenchContribution2(QuantumIDEErrorBoundaryContribution.ID, QuantumIDEErrorBoundaryContribution, WorkbenchPhase.AfterRestored);

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'quantumide.search.unified',
				title: localize2('quantumide.search.unified', 'QuantumIDE: Unified Codebase Search'),
				category: { value: localize('quantumide.production', 'QuantumIDE Production'), original: 'QuantumIDE Production' },
				f1: true,
			});
		}
		override async run(accessor: ServicesAccessor): Promise<void> {
			const q = await accessor.get(IQuickInputService).input({
				title: localize('quantumide.search.unifiedTitle', 'Search codebase (semantic + symbols + paths)'),
			});
			if (!q) {
				return;
			}
			const hits = await accessor.get(IQuantumIDEUnifiedSearchService).search(q, 25);
			const picked = await accessor.get(IQuickInputService).pick(
				hits.map(h => ({ label: h.label, description: h.path, detail: `${h.kind} · ${h.detail}`, hit: h })),
				{ placeHolder: localize('quantumide.search.results', 'Search results') },
			);
			if (picked && 'hit' in picked) {
				const h = picked.hit as import('../services/quantumide/common/quantumidePlatformOps.js').IQuantumIDEUnifiedSearchHit;
				await accessor.get(IQuantumIDEFileNavigationService).openFile(h.path, h.line);
			}
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'quantumide.workspace.openSnapshotDiff',
				title: localize2('quantumide.workspace.openSnapshotDiff', 'QuantumIDE: Open Snapshot Side-by-Side Diff'),
				category: { value: localize('quantumide.production', 'QuantumIDE Production'), original: 'QuantumIDE Production' },
				f1: true,
			});
		}
		override async run(accessor: ServicesAccessor, snapshotId?: string): Promise<void> {
			const snapshots = accessor.get(IQuantumIDEWorkspaceSnapshotService);
			const id = snapshotId ?? (await accessor.get(IQuickInputService).pick(
				(await snapshots.listSnapshots()).map(s => ({ label: s.label, description: new Date(s.createdAt).toLocaleString(), id: s.id })),
				{ placeHolder: localize('quantumide.snapshot.pickDiff', 'Choose snapshot') },
			))?.id;
			if (!id) {
				return;
			}
			const r = await snapshots.openSnapshotMultiDiff(id);
			if (!r.ok) {
				accessor.get(INotificationService).error(r.error ?? localize('quantumide.snapshot.diffFailed', 'Could not open snapshot diff.'));
			}
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'quantumide.chat.exportThreads',
				title: localize2('quantumide.chat.exportThreads', 'QuantumIDE: Export Chat Threads'),
				category: { value: localize('quantumide.production', 'QuantumIDE Production'), original: 'QuantumIDE Production' },
			});
		}
		override async run(accessor: ServicesAccessor): Promise<void> {
			const uri = await accessor.get(IFileDialogService).showSaveDialog({
				title: localize('quantumide.chat.exportThreads', 'Export chat threads'),
				filters: [{ name: 'JSON', extensions: ['json'] }],
			});
			if (!uri) {
				return;
			}
			const data = JSON.stringify(accessor.get(IQuantumIDEChatThreadStoreService).getThreads(), null, 2);
			await accessor.get(IFileService).writeFile(uri, VSBuffer.fromString(data));
			accessor.get(INotificationService).info(localize('quantumide.chat.exported', 'Chat threads exported.'));
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'quantumide.collab.applyOfflineReplay',
				title: localize2('quantumide.collab.applyOfflineReplay', 'QuantumIDE: Apply Offline Collaboration Sync'),
				category: { value: localize('quantumide.production', 'QuantumIDE Production'), original: 'QuantumIDE Production' },
			});
		}
		override async run(accessor: ServicesAccessor): Promise<void> {
			const collab = accessor.get(IQuantumIDECollaborationService);
			if (!collab.hasOfflineReplayPending()) {
				accessor.get(INotificationService).info(localize('quantumide.collab.noReplay', 'No offline changes waiting to sync.'));
				return;
			}
			await collab.applyOfflineReplay();
			accessor.get(INotificationService).info(localize('quantumide.collab.replayed', 'Offline collaboration changes synced.'));
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'quantumide.telemetry.configure',
				title: localize2('quantumide.telemetry.configure', 'QuantumIDE: Configure Telemetry'),
				category: { value: localize('quantumide.production', 'QuantumIDE Production'), original: 'QuantumIDE Production' },
			});
		}
		override async run(accessor: ServicesAccessor): Promise<void> {
			const telemetry = accessor.get(IQuantumIDETelemetryService);
			const pick = await accessor.get(IQuickInputService).pick([
				{ label: localize('quantumide.telemetry.enable', 'Enable opt-in telemetry'), id: 'on' },
				{ label: localize('quantumide.telemetry.disable', 'Disable telemetry'), id: 'off' },
				{ label: localize('quantumide.telemetry.export', 'Export telemetry JSON'), id: 'export' },
			], { placeHolder: localize('quantumide.telemetry.pick', 'Telemetry') });
			if (!pick) {
				return;
			}
			if (pick.id === 'on') {
				telemetry.setEnabled(true);
				accessor.get(INotificationService).info(localize('quantumide.telemetry.on', 'QuantumIDE telemetry enabled (local events only).'));
			} else if (pick.id === 'off') {
				telemetry.setEnabled(false);
				accessor.get(INotificationService).info(localize('quantumide.telemetry.off', 'QuantumIDE telemetry disabled.'));
			} else if (pick.id === 'export') {
				const uri = await accessor.get(IFileDialogService).showSaveDialog({ filters: [{ name: 'JSON', extensions: ['json'] }] });
				if (uri) {
					await accessor.get(IFileService).writeFile(uri, VSBuffer.fromString(telemetry.exportJson()));
					accessor.get(INotificationService).info(localize('quantumide.telemetry.exported', 'Telemetry exported.'));
				}
			}
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'quantumide.workspace.gcSnapshots',
				title: localize2('quantumide.workspace.gcSnapshots', 'QuantumIDE: Prune Old Snapshots'),
				category: { value: localize('quantumide.production', 'QuantumIDE Production'), original: 'QuantumIDE Production' },
			});
		}
		override async run(accessor: ServicesAccessor): Promise<void> {
			const { removed } = await accessor.get(IQuantumIDEWorkspaceSnapshotService).gcSnapshots(40);
			accessor.get(INotificationService).info(localize('quantumide.snapshot.gc', 'Removed {0} old snapshot(s).', removed));
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'quantumide.chat.cancelStreamFull',
				title: localize2('quantumide.chat.cancelStreamFull', 'QuantumIDE: Cancel Chat and Background Tasks'),
				category: { value: localize('quantumide.production', 'QuantumIDE Production'), original: 'QuantumIDE Production' },
			});
		}
		override async run(accessor: ServicesAccessor): Promise<void> {
			await accessor.get(ICommandService).executeCommand('workbench.action.chat.cancel');
			const activeTerminal = accessor.get(ITerminalService).activeInstance;
			if (activeTerminal) {
				activeTerminal.sendText('\u0003', false);
			}
			await accessor.get(IQuantumIDEAgentTaskOrchestratorService).abort();
			accessor.get(INotificationService).info(localize('quantumide.chat.cancelledFull', 'Chat, terminals, and agent task cancelled.'));
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'quantumide.chat.openUnifiedReview',
				title: localize2('quantumide.chat.openUnifiedReview', 'QuantumIDE: Review All Pending Edits'),
				category: { value: localize('quantumide.production', 'QuantumIDE Production'), original: 'QuantumIDE Production' },
				f1: true,
			});
		}
		override async run(accessor: ServicesAccessor): Promise<void> {
			await accessor.get(ICommandService).executeCommand(QuantumIDEAICommandId.ChatReviewPendingEdits);
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'quantumide.context.showInspector',
				title: localize2('quantumide.context.showInspector', 'QuantumIDE: Show Context Inspector'),
				category: { value: localize('quantumide.production', 'QuantumIDE Production'), original: 'QuantumIDE Production' },
			});
		}
		override async run(accessor: ServicesAccessor): Promise<void> {
			const sections = accessor.get(IQuantumIDEContextInspectorService).getSections();
			if (!sections.length) {
				accessor.get(INotificationService).info(localize('quantumide.context.empty', 'Reload chat context first (QuantumIDE: Reload Chat Context).'));
				await accessor.get(ICommandService).executeCommand('quantumide.chat.reloadContext');
				return;
			}
			const body = sections.map(s => `${s.title}: ${s.charCount} chars${s.omitted ? ' (omitted)' : ''}`).join('\n');
			accessor.get(INotificationService).info(body.slice(0, 6000));
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'quantumide.audit.showSession',
				title: localize2('quantumide.audit.showSession', 'QuantumIDE: Show Command Audit Log'),
				category: { value: localize('quantumide.production', 'QuantumIDE Production'), original: 'QuantumIDE Production' },
			});
		}
		override async run(accessor: ServicesAccessor): Promise<void> {
			const entries = accessor.get(IQuantumIDECommandAuditService).getSessionLog(30);
			const lines = entries.length
				? entries.map(e => `${new Date(e.timestamp).toLocaleTimeString()} ${e.commandId}`).join('\n')
				: localize('quantumide.audit.empty', 'No audited commands this session.');
			accessor.get(INotificationService).info(lines.slice(0, 8000));
		}
	});
}
