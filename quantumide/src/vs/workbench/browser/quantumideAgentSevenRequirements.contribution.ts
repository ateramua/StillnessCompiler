/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * QuantumIDE AI — 7 Cursor agent parity requirements (single implementation pass).
 * 1 Direct editor UI (inline, refactor preview, move files, merge UI)
 * 2 Workspace-wide LSP symbol rename
 * 3 Live editor context snapshot
 * 4 Real-time collaborative editing (presence + relay)
 * 5 Split editors / side-by-side diffs
 * 6 Instant command palette actions
 * 7 Backend/workflow parity (prompt catalog)
 */

import { Disposable } from '../../base/common/lifecycle.js';
import { localize, localize2 } from '../../nls.js';
import { Action2, registerAction2 } from '../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../platform/configuration/common/configuration.js';
import { ServicesAccessor } from '../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../platform/notification/common/notification.js';
import { IQuickInputService } from '../../platform/quickinput/common/quickInput.js';
import { isQuantumIDEProduct } from '../../platform/quantumide/common/quantumideChatPlatform.js';
import { QuantumIDEAICommandId, QuantumIDEAISettingId } from '../../platform/quantumide/common/quantumideAISettings.js';
import product from '../../platform/product/common/product.js';
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from '../common/contributions.js';
import { ICodeEditorService } from '../../editor/browser/services/codeEditorService.js';
import { ICommandService } from '../../platform/commands/common/commands.js';
import { URI } from '../../base/common/uri.js';
import { IEditorService } from '../services/editor/common/editorService.js';
import { IQuantumIDEFileExplorerTreeService } from '../services/quantumide/common/quantumideFileExplorerTree.js';
import { IQuantumIDEInlineDiffService } from '../services/quantumide/browser/quantumideInlineDiffService.js';
import { IQuantumIDEChatInThreadInjectService } from '../services/quantumide/common/quantumideChatInThreadInject.js';
import { IQuantumIDEMergeConflictService } from '../services/quantumide/browser/quantumideMergeConflictService.js';
import { IQuantumIDEAgentUiParityService } from '../services/quantumide/browser/quantumideAgentUiParityService.js';
import { IQuantumIDECollaborationService } from '../services/quantumide/common/quantumideCollaboration.js';
import { IWorkspaceContextService } from '../../platform/workspace/common/workspace.js';
import '../services/quantumide/browser/quantumideAgentContextSnapshotService.js';
import '../services/quantumide/browser/quantumideAgentUiParityService.js';

function isQuantumIDE(): boolean {
	return isQuantumIDEProduct(product.applicationName)
		|| [product.nameShort, product.nameLong].some(n => typeof n === 'string' && n.toLowerCase().includes('quantumide'));
}

/** §1 + §3 — bridge inline diff and merge markers into chat; §4 collab status. */
class QuantumIDEAgentEditorUiBridgeContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.quantumideAgentEditorUiBridge';

	constructor(
		@IQuantumIDEInlineDiffService inlineDiff: IQuantumIDEInlineDiffService,
		@IQuantumIDEChatInThreadInjectService inject: IQuantumIDEChatInThreadInjectService,
		@ICodeEditorService codeEditor: ICodeEditorService,
		@IQuantumIDEMergeConflictService merge: IQuantumIDEMergeConflictService,
		@IQuantumIDECollaborationService collab: IQuantumIDECollaborationService,
		@IConfigurationService config: IConfigurationService,
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
			const path = proposal.uri.path.split('/').pop() ?? proposal.uri.fsPath;
			inject.injectLiveRefactorPreview(path, inlineDiff.getHunks().length);
		}));
		this._register(codeEditor.onCodeEditorAdd(ed => {
			const model = ed.getModel();
			if (!model) {
				return;
			}
			this._register(model.onDidChangeContent(() => {
				const text = model.getValue();
				if (merge.hasConflictMarkers(model.uri, text)) {
					const count = merge.countConflictMarkers(text);
					const path = model.uri.path.split('/').pop() ?? model.uri.fsPath;
					inject.injectMergeConflictUi(path, count);
				}
			}));
		}));
		if (config.getValue<boolean>(QuantumIDEAISettingId.ChatCollabEnabled) === true) {
			this._register(collab.onDidChangeSession(() => {
				const session = collab.getActiveSession();
				if (!session) {
					return;
				}
				const active = session.participants
					.filter(p => p.presence?.resource)
					.map(p => p.presence!.resource!.split('/').pop() ?? p.presence!.resource!);
				inject.injectCollabLiveStatus(session.participants.length, active);
			}));
		}
	}
}

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: QuantumIDEAICommandId.ChatMoveFiles,
			title: localize2('quantumide.chat.moveFiles', 'QuantumIDE: Move Files (Agent)'),
			category: localize('quantumide.category', 'QuantumIDE'),
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const quickInput = accessor.get(IQuickInputService);
		const fileTree = accessor.get(IQuantumIDEFileExplorerTreeService);
		const workspace = accessor.get(IWorkspaceContextService);
		const root = workspace.getWorkspace().folders[0]?.uri;
		if (!root) {
			return;
		}
		const sourcesRaw = await quickInput.input({
			prompt: localize('quantumide.chat.moveFiles.sources', 'Comma-separated workspace-relative paths to move'),
			placeHolder: 'src/old.ts, src/components/Old',
		});
		if (!sourcesRaw) {
			return;
		}
		const targetDir = await quickInput.input({
			prompt: localize('quantumide.chat.moveFiles.target', 'Target directory (workspace-relative)'),
			placeHolder: 'src/components',
		});
		if (!targetDir) {
			return;
		}
		const sources = sourcesRaw.split(',').map(s => s.trim()).filter(Boolean);
		const targetUri = URI.joinPath(root, targetDir.replace(/^\.\//, ''));
		const sourceUris = sources.map(p => URI.joinPath(root, p.replace(/^\.\//, '')));
		const result = await fileTree.moveEntries(sourceUris, targetUri);
		accessor.get(INotificationService).info(
			localize('quantumide.chat.moveFiles.done', 'Moved {0} item(s).', result.moved),
		);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: QuantumIDEAICommandId.ChatSplitEditorRight,
			title: localize2('quantumide.chat.splitRight', 'QuantumIDE: Split Editor Right'),
			category: localize('quantumide.category', 'QuantumIDE'),
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		await accessor.get(IQuantumIDEAgentUiParityService).splitEditorRight();
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: QuantumIDEAICommandId.ChatSplitEditorDown,
			title: localize2('quantumide.chat.splitDown', 'QuantumIDE: Split Editor Down'),
			category: localize('quantumide.category', 'QuantumIDE'),
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		await accessor.get(IQuantumIDEAgentUiParityService).splitEditorDown();
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: QuantumIDEAICommandId.ChatOpenMergeConflictUi,
			title: localize2('quantumide.chat.mergeUi', 'QuantumIDE: Open Merge Conflict UI'),
			category: localize('quantumide.category', 'QuantumIDE'),
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const merge = accessor.get(IQuantumIDEMergeConflictService);
		const editor = accessor.get(IEditorService);
		const uri = editor.activeEditor?.resource;
		const result = await merge.resolveConflictAction('open_merge_editor', uri);
		accessor.get(INotificationService).info(result.message);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: QuantumIDEAICommandId.ChatLiveRefactorPreview,
			title: localize2('quantumide.chat.liveRefactor', 'QuantumIDE: Live Refactor Preview'),
			category: localize('quantumide.category', 'QuantumIDE'),
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const inlineDiff = accessor.get(IQuantumIDEInlineDiffService);
		const proposal = inlineDiff.getActiveProposal();
		if (!proposal) {
			accessor.get(INotificationService).warn(localize('quantumide.chat.noProposal', 'No active inline proposal.'));
			return;
		}
		await accessor.get(ICommandService).executeCommand(QuantumIDEAICommandId.InlineDiffSideBySide);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: QuantumIDEAICommandId.ChatCollabLiveStatus,
			title: localize2('quantumide.chat.collabStatus', 'QuantumIDE: Show Collab Live Status in Chat'),
			category: localize('quantumide.category', 'QuantumIDE'),
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const collab = accessor.get(IQuantumIDECollaborationService);
		const inject = accessor.get(IQuantumIDEChatInThreadInjectService);
		const session = collab.getActiveSession();
		if (!session) {
			accessor.get(INotificationService).warn(localize('quantumide.chat.noCollab', 'No active collaboration session.'));
			return;
		}
		const active = session.participants
			.filter(p => p.presence?.resource)
			.map(p => p.presence!.resource!.split('/').pop() ?? p.presence!.resource!);
		inject.injectCollabLiveStatus(session.participants.length, active);
	}
});

if (isQuantumIDE()) {
	registerWorkbenchContribution2(QuantumIDEAgentEditorUiBridgeContribution.ID, QuantumIDEAgentEditorUiBridgeContribution, WorkbenchPhase.AfterRestored);
}
