/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import './media/quantumideInlineDiff.css';
import { localize, localize2 } from '../../nls.js';
import { Action2, registerAction2 } from '../../platform/actions/common/actions.js';
import { IClipboardService } from '../../platform/clipboard/common/clipboardService.js';
import { ServicesAccessor } from '../../platform/instantiation/common/instantiation.js';
import { QuantumIDEAICommandId } from '../../platform/quantumide/common/quantumideAISettings.js';
import { ICodeEditorService } from '../../editor/browser/services/codeEditorService.js';
import { INotificationService } from '../../platform/notification/common/notification.js';
import { IQuickInputService } from '../../platform/quickinput/common/quickInput.js';
import { IQuantumIDEInlineDiffService } from '../services/quantumide/browser/quantumideInlineDiffService.js';

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: QuantumIDEAICommandId.InlineDiffAccept,
			title: localize2('quantumide.inline.diffAccept', 'Accept Inline AI Diff'),
			f1: true,
		});
	}
	override run(accessor: ServicesAccessor): void {
		const service = accessor.get(IQuantumIDEInlineDiffService);
		if (!service.acceptProposal()) {
			accessor.get(INotificationService).info(localize('quantumide.inline.noProposal', 'No inline AI diff is active.'));
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'quantumide.ai.inline.diffAcceptAll',
			title: localize2('quantumide.inline.diffAcceptAll', 'Accept All Inline AI Diff Hunks'),
			f1: true,
		});
	}
	override run(accessor: ServicesAccessor): void {
		const service = accessor.get(IQuantumIDEInlineDiffService);
		if (!service.acceptAllHunks()) {
			accessor.get(INotificationService).info(localize('quantumide.inline.noProposal', 'No inline AI diff is active.'));
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'quantumide.ai.inline.diffRejectAll',
			title: localize2('quantumide.inline.diffRejectAll', 'Reject All Remaining Inline AI Diff Hunks'),
			f1: true,
		});
	}
	override run(accessor: ServicesAccessor): void {
		accessor.get(IQuantumIDEInlineDiffService).rejectAllRemainingHunks();
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: QuantumIDEAICommandId.InlineDiffReject,
			title: localize2('quantumide.inline.diffReject', 'Reject Inline AI Diff'),
			f1: true,
		});
	}
	override run(accessor: ServicesAccessor): void {
		accessor.get(IQuantumIDEInlineDiffService).rejectProposal();
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: QuantumIDEAICommandId.InlineDiffAcceptHunk,
			title: localize2('quantumide.inline.diffAcceptHunk', 'Accept Current Inline Diff Hunk'),
			f1: true,
		});
	}
	override run(accessor: ServicesAccessor): void {
		const service = accessor.get(IQuantumIDEInlineDiffService);
		if (!service.acceptCurrentHunk()) {
			accessor.get(INotificationService).info(localize('quantumide.inline.noProposal', 'No inline AI diff is active.'));
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: QuantumIDEAICommandId.InlineDiffUnified,
			title: localize2('quantumide.inline.diffUnified', 'Open Inline AI Unified Diff'),
			f1: true,
		});
	}
	override async run(accessor: ServicesAccessor): Promise<void> {
		await accessor.get(IQuantumIDEInlineDiffService).openUnifiedDiffPreview();
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: QuantumIDEAICommandId.InlineDiffCommentHunk,
			title: localize2('quantumide.inline.diffCommentHunk', 'Comment on Current Inline Diff Hunk'),
			f1: true,
		});
	}
	override async run(accessor: ServicesAccessor): Promise<void> {
		const service = accessor.get(IQuantumIDEInlineDiffService);
		const hunks = service.getHunks();
		if (hunks.length === 0) {
			accessor.get(INotificationService).info(localize('quantumide.inline.noProposal', 'No inline AI diff is active.'));
			return;
		}
		const comment = await accessor.get(IQuickInputService).input({
			prompt: localize('quantumide.inline.commentPrompt', 'Add a review comment for the current hunk'),
		});
		if (comment !== undefined) {
			service.setHunkComment(service.getActiveHunkIndex(), comment);
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: QuantumIDEAICommandId.InlineDiffSideBySide,
			title: localize2('quantumide.inline.diffSideBySide', 'Open Inline Diff Side-by-Side'),
			f1: true,
		});
	}
	override async run(accessor: ServicesAccessor): Promise<void> {
		await accessor.get(IQuantumIDEInlineDiffService).openSideBySidePreview();
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'quantumide.ai.inline.previewClipboard',
			title: localize2('quantumide.inline.previewClipboard', 'Preview Clipboard as Inline AI Diff'),
			f1: true,
		});
	}
	override async run(accessor: ServicesAccessor): Promise<void> {
		const editor = accessor.get(ICodeEditorService).getActiveCodeEditor();
		const model = editor?.getModel();
		const selection = editor?.getSelection();
		if (!editor || !model || !selection || selection.isEmpty()) {
			accessor.get(INotificationService).info(localize('quantumide.inline.needSelection', 'Select code to preview an inline diff.'));
			return;
		}
		const proposed = await accessor.get(IClipboardService).readText();
		if (!proposed.trim()) {
			accessor.get(INotificationService).warn(localize('quantumide.inline.emptyClipboard', 'Clipboard is empty.'));
			return;
		}
		const original = model.getValueInRange(selection);
		accessor.get(IQuantumIDEInlineDiffService).showProposal(model.uri, selection, original, proposed);
	}
});
