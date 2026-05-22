/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../nls.js';
import { Action2, registerAction2 } from '../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../platform/instantiation/common/instantiation.js';
import { ICommandService } from '../../platform/commands/common/commands.js';
import { IQuantumIDEContextHealthService } from '../services/quantumide/common/quantumideContextHealth.js';
import { IQuantumIDEWorkspaceSnapshotService } from '../services/quantumide/common/quantumideWorkspaceSnapshot.js';
import { IQuantumIDEChatThreadStoreService } from '../services/quantumide/common/quantumideChatThreadStore.js';
import { IQuantumIDEFileExplorerTreeService } from '../services/quantumide/common/quantumideFileExplorerTree.js';
import { IQuantumIDEWorkspaceStateService } from '../services/quantumide/common/quantumideWorkspaceState.js';
import { IQuantumIDECollaborationService } from '../services/quantumide/common/quantumideCollaboration.js';
import { URI } from '../../base/common/uri.js';
import { INotificationService } from '../../platform/notification/common/notification.js';
import { IQuickInputService } from '../../platform/quickinput/common/quickInput.js';
import { ChatViewPaneTarget, IChatWidgetService } from '../contrib/chat/browser/chat.js';
import { ITerminalService } from '../contrib/terminal/browser/terminal.js';
import { IQuantumIDEAgentTaskOrchestratorService } from '../services/quantumide/common/quantumideAgentTask.js';
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'quantumide.fileTree.refresh',
			title: localize2('quantumide.fileTree.refresh', 'QuantumIDE: Refresh File Explorer Tree'),
			category: { value: localize('quantumide.production', 'QuantumIDE Production'), original: 'QuantumIDE Production' },
			f1: true,
		});
	}
	override async run(accessor: ServicesAccessor): Promise<void> {
		await accessor.get(IQuantumIDEFileExplorerTreeService).refresh();
		accessor.get(INotificationService).info(localize('quantumide.fileTree.refreshed', 'File tree refreshed.'));
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'quantumide.fileTree.rename',
			title: localize2('quantumide.fileTree.rename', 'QuantumIDE: Rename File or Folder'),
			category: { value: localize('quantumide.production', 'QuantumIDE Production'), original: 'QuantumIDE Production' },
		});
	}
	override async run(accessor: ServicesAccessor, resource?: string): Promise<void> {
		if (!resource) {
			return;
		}
		const uri = URI.parse(resource);
		const newName = await accessor.get(IQuickInputService).input({
			title: localize('quantumide.fileTree.renameTitle', 'New name'),
			value: uri.path.split('/').pop() ?? '',
		});
		if (!newName) {
			return;
		}
		const result = await accessor.get(IQuantumIDEFileExplorerTreeService).renameEntry(uri, newName);
		if (!result.ok) {
			accessor.get(INotificationService).error(result.error ?? localize('quantumide.fileTree.renameFailed', 'Rename failed.'));
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'quantumide.fileTree.delete',
			title: localize2('quantumide.fileTree.delete', 'QuantumIDE: Delete File or Folder'),
			category: { value: localize('quantumide.production', 'QuantumIDE Production'), original: 'QuantumIDE Production' },
		});
	}
	override async run(accessor: ServicesAccessor, resource?: string): Promise<void> {
		if (!resource) {
			return;
		}
		await accessor.get(ICommandService).executeCommand('deleteFile', URI.parse(resource));
		await accessor.get(IQuantumIDEFileExplorerTreeService).refresh();
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'quantumide.workspace.saveSession',
			title: localize2('quantumide.workspace.saveSession', 'QuantumIDE: Save Workspace Session'),
			category: { value: localize('quantumide.production', 'QuantumIDE Production'), original: 'QuantumIDE Production' },
			f1: true,
		});
	}
	override async run(accessor: ServicesAccessor): Promise<void> {
		const label = await accessor.get(IQuickInputService).input({
			title: localize('quantumide.workspace.sessionLabel', 'Session label (optional)'),
			placeHolder: localize('quantumide.workspace.sessionLabelPh', 'Before release…'),
		});
		const notifications = accessor.get(INotificationService);
		const meta = await accessor.get(IQuantumIDEWorkspaceStateService).persistState(
			typeof label === 'string' && label.trim() ? label.trim() : undefined,
			{ captureWorkingSet: true, notifyOnFailure: true },
		);
		if (meta) {
			notifications.info(
				localize('quantumide.workspace.sessionSaved', 'Workspace session saved ({0} files, {1}).', meta.openFileCount, new Date(meta.savedAt).toLocaleString()),
			);
		} else {
			notifications.error(localize('quantumide.workspace.sessionSaveFailed', 'Could not save workspace session. Open a folder on disk, trust the workspace, and try again.'));
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'quantumide.workspace.restoreSession',
			title: localize2('quantumide.workspace.restoreSession', 'QuantumIDE: Restore Workspace Session'),
			category: { value: localize('quantumide.production', 'QuantumIDE Production'), original: 'QuantumIDE Production' },
			f1: true,
		});
	}
	override async run(accessor: ServicesAccessor, savedAt?: number): Promise<void> {
		const state = accessor.get(IQuantumIDEWorkspaceStateService);
		if (savedAt) {
			const result = await state.restoreFromHistory(savedAt);
			if (result.ok) {
				accessor.get(INotificationService).info(localize('quantumide.workspace.sessionRestored', 'Workspace session restored.'));
			} else {
				accessor.get(INotificationService).error(result.error ?? localize('quantumide.workspace.sessionRestoreFailed', 'Restore failed.'));
			}
			return;
		}
		const history = await state.listHistory();
		const pick = history.length > 1
			? await accessor.get(IQuickInputService).pick(
				history.map(h => ({
					label: h.label ?? localize('quantumide.workspace.sessionUnlabeled', 'Session'),
					description: new Date(h.savedAt).toLocaleString(),
					detail: localize('quantumide.workspace.sessionFiles', '{0} open files', h.openFileCount),
					savedAt: h.savedAt,
				})),
				{ placeHolder: localize('quantumide.workspace.pickSession', 'Choose session to restore') },
			)
			: undefined;
		const result = pick && 'savedAt' in pick
			? await state.restoreFromHistory(pick.savedAt as number)
			: await state.restoreLastState();
		if (result.ok) {
			accessor.get(INotificationService).info(localize('quantumide.workspace.sessionRestored', 'Workspace session restored.'));
		} else {
			accessor.get(INotificationService).error(result.error ?? localize('quantumide.workspace.sessionRestoreFailed', 'Restore failed.'));
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'quantumide.collab.forceSync',
			title: localize2('quantumide.collab.forceSync', 'QuantumIDE: Force Collaboration Sync'),
			category: { value: localize('quantumide.production', 'QuantumIDE Production'), original: 'QuantumIDE Production' },
		});
	}
	override async run(accessor: ServicesAccessor): Promise<void> {
		await accessor.get(IQuantumIDECollaborationService).forceSync();
		accessor.get(INotificationService).info(localize('quantumide.collab.synced', 'Collaboration sync complete.'));
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'quantumide.collab.leave',
			title: localize2('quantumide.collab.leave', 'QuantumIDE: Leave Collaboration Session'),
			category: { value: localize('quantumide.production', 'QuantumIDE Production'), original: 'QuantumIDE Production' },
		});
	}
	override async run(accessor: ServicesAccessor): Promise<void> {
		await accessor.get(IQuantumIDECollaborationService).leaveSession();
		accessor.get(INotificationService).info(localize('quantumide.collab.left', 'Left collaboration session.'));
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'quantumide.collab.resolveConflict',
			title: localize2('quantumide.collab.resolveConflict', 'QuantumIDE: Resolve Collaboration Conflict'),
			category: { value: localize('quantumide.production', 'QuantumIDE Production'), original: 'QuantumIDE Production' },
		});
	}
	override async run(accessor: ServicesAccessor, strategy?: 'local' | 'remote' | 'merge'): Promise<void> {
		const ok = await accessor.get(IQuantumIDECollaborationService).resolveConflict(strategy ?? 'merge');
		if (ok) {
			accessor.get(INotificationService).info(localize('quantumide.collab.resolved', 'Conflict resolved.'));
		} else {
			accessor.get(INotificationService).warn(localize('quantumide.collab.noConflict', 'No active conflict.'));
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'quantumide.chat.reloadContext',
			title: localize2('quantumide.chat.reloadContext', 'QuantumIDE: Reload Chat Context'),
			category: { value: localize('quantumide.production', 'QuantumIDE Production'), original: 'QuantumIDE Production' },
			f1: true,
		});
	}
	override async run(accessor: ServicesAccessor): Promise<void> {
		await accessor.get(IQuantumIDEContextHealthService).reloadContext();
		accessor.get(INotificationService).info(localize('quantumide.chat.contextReloaded', 'Chat context reloaded.'));
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'quantumide.chat.cancelStream',
			title: localize2('quantumide.chat.cancelStream', 'QuantumIDE: Cancel Chat Response'),
			category: { value: localize('quantumide.production', 'QuantumIDE Production'), original: 'QuantumIDE Production' },
			f1: true,
		});
	}
	override async run(accessor: ServicesAccessor): Promise<void> {
		await accessor.get(ICommandService).executeCommand('workbench.action.chat.cancel');
		const activeTerminal = accessor.get(ITerminalService).activeInstance;
		if (activeTerminal) {
			activeTerminal.sendText('\u0003', false);
		}
		await accessor.get(IQuantumIDEAgentTaskOrchestratorService).abort();
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'quantumide.workspace.createSnapshot',
			title: localize2('quantumide.workspace.createSnapshot', 'QuantumIDE: Create Workspace Snapshot'),
			category: { value: localize('quantumide.production', 'QuantumIDE Production'), original: 'QuantumIDE Production' },
			f1: true,
		});
	}
	override async run(accessor: ServicesAccessor): Promise<void> {
		const label = await accessor.get(IQuickInputService).input({
			title: localize('quantumide.snapshot.label', 'Snapshot label'),
			placeHolder: localize('quantumide.snapshot.labelPh', 'Before refactor…'),
		});
		const meta = await accessor.get(IQuantumIDEWorkspaceSnapshotService).createSnapshot(label ?? undefined);
		accessor.get(INotificationService).info(localize('quantumide.snapshot.created', 'Snapshot "{0}" saved ({1} files).', meta.label, meta.fileCount));
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'quantumide.workspace.restoreSnapshot',
			title: localize2('quantumide.workspace.restoreSnapshot', 'QuantumIDE: Restore Workspace Snapshot'),
			category: { value: localize('quantumide.production', 'QuantumIDE Production'), original: 'QuantumIDE Production' },
		});
	}
	override async run(accessor: ServicesAccessor, snapshotId?: string): Promise<void> {
		const snapshots = accessor.get(IQuantumIDEWorkspaceSnapshotService);
		const id = snapshotId ?? (await accessor.get(IQuickInputService).pick(
			(await snapshots.listSnapshots()).map(s => ({ label: s.label, description: new Date(s.createdAt).toLocaleString(), id: s.id })),
			{ placeHolder: localize('quantumide.snapshot.pick', 'Choose snapshot to restore') },
		))?.id;
		if (!id) {
			return;
		}
		const r = await snapshots.restoreSnapshot(id);
		if (r.error) {
			accessor.get(INotificationService).error(r.error);
		} else {
			const msg = r.preBackupId
				? localize('quantumide.snapshot.restoredWithBackup', 'Snapshot restored. Pre-restore backup created.')
				: localize('quantumide.snapshot.restored', 'Snapshot restored.');
			accessor.get(INotificationService).info(msg);
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'quantumide.workspace.deleteSnapshot',
			title: localize2('quantumide.workspace.deleteSnapshot', 'QuantumIDE: Delete Workspace Snapshot'),
			category: { value: localize('quantumide.production', 'QuantumIDE Production'), original: 'QuantumIDE Production' },
		});
	}
	override async run(accessor: ServicesAccessor, snapshotId?: string): Promise<void> {
		if (!snapshotId) {
			return;
		}
		const r = await accessor.get(IQuantumIDEWorkspaceSnapshotService).deleteSnapshot(snapshotId);
		if (r.ok) {
			accessor.get(INotificationService).info(localize('quantumide.snapshot.deleted', 'Snapshot deleted.'));
		} else {
			accessor.get(INotificationService).error(r.error ?? localize('quantumide.snapshot.deleteFailed', 'Delete failed.'));
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'quantumide.workspace.previewSnapshotDiff',
			title: localize2('quantumide.workspace.previewSnapshotDiff', 'QuantumIDE: Preview Snapshot Diff'),
			category: { value: localize('quantumide.production', 'QuantumIDE Production'), original: 'QuantumIDE Production' },
			f1: true,
		});
	}
	override async run(accessor: ServicesAccessor, snapshotId?: string): Promise<void> {
		const snapshots = accessor.get(IQuantumIDEWorkspaceSnapshotService);
		const id = snapshotId ?? (await accessor.get(IQuickInputService).pick(
			(await snapshots.listSnapshots()).map(s => ({ label: s.label, description: new Date(s.createdAt).toLocaleString(), id: s.id })),
			{ placeHolder: localize('quantumide.snapshot.pickDiff', 'Choose snapshot to diff') },
		))?.id;
		if (!id) {
			return;
		}
		const diff = await snapshots.getSnapshotDiff(id);
		if (!diff) {
			accessor.get(INotificationService).warn(localize('quantumide.snapshot.diffUnavailable', 'Diff unavailable.'));
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
			id: 'quantumide.chat.openThread',
			title: localize2('quantumide.chat.openThread', 'QuantumIDE: Open Chat Thread'),
			category: { value: localize('quantumide.production', 'QuantumIDE Production'), original: 'QuantumIDE Production' },
		});
	}
	override async run(accessor: ServicesAccessor, sessionResource?: string): Promise<void> {
		if (!sessionResource) {
			return;
		}
		await accessor.get(IChatWidgetService).openSession(URI.parse(sessionResource), ChatViewPaneTarget);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'quantumide.chat.pinThread',
			title: localize2('quantumide.chat.pinThread', 'QuantumIDE: Pin Chat Thread'),
			category: { value: localize('quantumide.production', 'QuantumIDE Production'), original: 'QuantumIDE Production' },
		});
	}
	override run(accessor: ServicesAccessor, threadId?: string, pinned?: boolean): void {
		if (!threadId) {
			return;
		}
		accessor.get(IQuantumIDEChatThreadStoreService).pinThread(threadId, pinned !== false);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'quantumide.chat.branchThread',
			title: localize2('quantumide.chat.branchThread', 'QuantumIDE: Branch Chat Thread'),
			category: { value: localize('quantumide.production', 'QuantumIDE Production'), original: 'QuantumIDE Production' },
		});
	}
	override async run(accessor: ServicesAccessor, threadId?: string, sessionResource?: string): Promise<void> {
		if (!threadId || !sessionResource) {
			return;
		}
		await accessor.get(ICommandService).executeCommand('workbench.action.chat.forkConversation', URI.parse(sessionResource));
		accessor.get(INotificationService).info(localize('quantumide.chat.branched', 'Conversation branched. The new thread is tracked when you send a message.'));
		void threadId;
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'quantumide.chat.searchThreads',
			title: localize2('quantumide.chat.searchThreads', 'QuantumIDE: Search Chat Threads'),
			category: { value: localize('quantumide.production', 'QuantumIDE Production'), original: 'QuantumIDE Production' },
			f1: true,
		});
	}
	override async run(accessor: ServicesAccessor): Promise<void> {
		const store = accessor.get(IQuantumIDEChatThreadStoreService);
		const q = await accessor.get(IQuickInputService).input({
			title: localize('quantumide.chat.searchThreads', 'Search chat threads'),
			placeHolder: localize('quantumide.chat.searchPh', 'Title or session id…'),
		});
		const items = store.search(q ?? '').map(t => ({
			label: t.title,
			description: new Date(t.updatedAt).toLocaleString(),
			detail: t.sessionResource,
			sessionResource: t.sessionResource,
		}));
		const picked = await accessor.get(IQuickInputService).pick(items, { placeHolder: localize('quantumide.chat.threadResults', 'Matching threads') });
		if (picked && 'sessionResource' in picked) {
			await accessor.get(ICommandService).executeCommand('quantumide.chat.openThread', picked.sessionResource);
		}
	}
});
