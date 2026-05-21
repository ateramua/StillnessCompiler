/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { localize } from '../../../../nls.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { Range } from '../../../../editor/common/core/range.js';
import { IBulkEditService, ResourceTextEdit } from '../../../../editor/browser/services/bulkEditService.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IQuantumIDEDiffReviewService } from './quantumideDiffReviewService.js';
import { IQuantumIDEChatRichUiService } from '../common/quantumideChatRichUi.js';

export interface IQuantumIDEChatPendingEdit {
	readonly id: string;
	readonly batchId: string;
	readonly path: string;
	readonly resourceUri?: string;
	readonly originalContent: string;
	readonly proposedContent: string;
}

export interface IQuantumIDEChatInlineEditService {
	readonly _serviceBrand: undefined;
	readonly onDidChangePending: import('../../../../base/common/event.js').Event<void>;
	getPendingEdits(): readonly IQuantumIDEChatPendingEdit[];
	stageEdits(edits: readonly { path: string; content: string; resourceUri?: string }[]): Promise<void>;
	getBatchIds(): readonly string[];
	getPendingEditsForBatch(batchId: string): readonly IQuantumIDEChatPendingEdit[];
	acceptEdit(id: string): Promise<boolean>;
	rejectEdit(id: string): void;
	acceptBatch(batchId: string): Promise<number>;
	rejectBatch(batchId: string): void;
	acceptAll(): Promise<number>;
	rejectAll(): void;
}

export const IQuantumIDEChatInlineEditService = createDecorator<IQuantumIDEChatInlineEditService>('quantumIDEChatInlineEditService');

export class QuantumIDEChatInlineEditService extends Disposable implements IQuantumIDEChatInlineEditService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangePending = this._register(new Emitter<void>());
	readonly onDidChangePending = this._onDidChangePending.event;

	private readonly _pending = new Map<string, IQuantumIDEChatPendingEdit>();
	private readonly _batchOrder: string[] = [];

	constructor(
		@IFileService private readonly _fileService: IFileService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IQuantumIDEDiffReviewService private readonly _diffReviewService: IQuantumIDEDiffReviewService,
		@IBulkEditService private readonly _bulkEditService: IBulkEditService,
		@IQuantumIDEChatRichUiService private readonly _richUi: IQuantumIDEChatRichUiService,
	) { super(); }

	getPendingEdits(): readonly IQuantumIDEChatPendingEdit[] {
		return [...this._pending.values()];
	}

	getBatchIds(): readonly string[] {
		return [...this._batchOrder];
	}

	getPendingEditsForBatch(batchId: string): readonly IQuantumIDEChatPendingEdit[] {
		return [...this._pending.values()].filter(edit => edit.batchId === batchId);
	}

	async stageEdits(edits: readonly { path: string; content: string; resourceUri?: string }[]): Promise<void> {
		const root = this._workspaceContextService.getWorkspace().folders[0]?.uri;
		if (edits.length === 0) {
			return;
		}
		const batchId = `batch-${Date.now()}`;
		this._batchOrder.unshift(batchId);
		for (const edit of edits) {
			const target = edit.resourceUri ? URI.parse(edit.resourceUri) : (root ? URI.joinPath(root, edit.path.replace(/\\/g, '/').replace(/^\.\//, '')) : undefined);
			if (!target) {
				continue;
			}
			let original = '';
			try {
				original = (await this._fileService.readFile(target)).value.toString();
			} catch {
				// new file
			}
			const id = `${batchId}:${edit.path}`;
			this._pending.set(id, { id, batchId, path: edit.path, resourceUri: target.toString(), originalContent: original, proposedContent: edit.content });
		}
		if (root) {
			await this._diffReviewService.openProposedFileEdits('QuantumIDE chat edits', edits, root);
		}
		for (const edit of edits) {
			this._richUi.addCard({
				threadId: batchId,
				kind: 'scm',
				title: edit.path,
				body: localize('quantumide.editCard.body', 'Proposed agent edit — review in chat or multi-diff.'),
				pinned: true,
				command: 'quantumide.chat.openUnifiedReview',
			});
		}
		this._onDidChangePending.fire();
	}

	async acceptEdit(id: string): Promise<boolean> {
		const edit = this._pending.get(id);
		const root = this._workspaceContextService.getWorkspace().folders[0]?.uri;
		if (!edit || !root) {
			return false;
		}
		const target = edit.resourceUri ? URI.parse(edit.resourceUri) : URI.joinPath(root, edit.path.replace(/\\/g, '/').replace(/^\.\//, ''));
		const range = fullTextRange(edit.originalContent);
		const summary = await this._bulkEditService.apply(
			[new ResourceTextEdit(target, { range, text: edit.proposedContent })],
			{ label: `QuantumIDE Chat Apply: ${edit.path}`, code: 'undoredo.quantumide.chatApplyEdit' },
		);
		if (summary.isApplied) {
			this._pending.delete(id);
			this._cleanupBatchIfEmpty(edit.batchId);
			this._onDidChangePending.fire();
		}
		return summary.isApplied;
	}

	rejectEdit(id: string): void {
		const edit = this._pending.get(id);
		if (edit && this._pending.delete(id)) {
			this._cleanupBatchIfEmpty(edit.batchId);
			this._onDidChangePending.fire();
		}
	}

	async acceptBatch(batchId: string): Promise<number> {
		const edits = this.getPendingEditsForBatch(batchId);
		if (edits.length === 0) {
			return 0;
		}
		const root = this._workspaceContextService.getWorkspace().folders[0]?.uri;
		if (!root) {
			return 0;
		}
		const textEdits = edits.map(edit => {
			const target = edit.resourceUri ? URI.parse(edit.resourceUri) : URI.joinPath(root, edit.path.replace(/\\/g, '/').replace(/^\.\//, ''));
			return new ResourceTextEdit(target, { range: fullTextRange(edit.originalContent), text: edit.proposedContent });
		});
		const summary = await this._bulkEditService.apply(textEdits, {
			label: `QuantumIDE Chat Apply Batch (${edits.length} files)`,
			code: 'undoredo.quantumide.chatApplyBatch',
		});
		if (!summary.isApplied) {
			return 0;
		}
		for (const edit of edits) {
			this._pending.delete(edit.id);
		}
		this._cleanupBatchIfEmpty(batchId);
		this._onDidChangePending.fire();
		return edits.length;
	}

	rejectBatch(batchId: string): void {
		let changed = false;
		for (const edit of this.getPendingEditsForBatch(batchId)) {
			changed = this._pending.delete(edit.id) || changed;
		}
		this._cleanupBatchIfEmpty(batchId);
		if (changed) {
			this._onDidChangePending.fire();
		}
	}

	async acceptAll(): Promise<number> {
		const all = this.getPendingEdits();
		if (all.length === 0) {
			return 0;
		}
		const root = this._workspaceContextService.getWorkspace().folders[0]?.uri;
		if (!root) {
			return 0;
		}
		const textEdits = all.map(edit => {
			const target = edit.resourceUri ? URI.parse(edit.resourceUri) : URI.joinPath(root, edit.path.replace(/\\/g, '/').replace(/^\.\//, ''));
			return new ResourceTextEdit(target, { range: fullTextRange(edit.originalContent), text: edit.proposedContent });
		});
		const summary = await this._bulkEditService.apply(textEdits, {
			label: `QuantumIDE Chat Apply All (${all.length} files)`,
			code: 'undoredo.quantumide.chatApplyAll',
		});
		if (!summary.isApplied) {
			return 0;
		}
		this._pending.clear();
		this._batchOrder.length = 0;
		this._onDidChangePending.fire();
		return all.length;
	}

	rejectAll(): void {
		if (this._pending.size > 0) {
			this._pending.clear();
			this._batchOrder.length = 0;
			this._onDidChangePending.fire();
		}
	}

	private _cleanupBatchIfEmpty(batchId: string): void {
		if (this.getPendingEditsForBatch(batchId).length > 0) {
			return;
		}
		const index = this._batchOrder.indexOf(batchId);
		if (index >= 0) {
			this._batchOrder.splice(index, 1);
		}
	}
}

function fullTextRange(text: string): Range {
	const lines = text.split(/\r?\n/);
	const endLine = Math.max(1, lines.length);
	const endColumn = (lines[endLine - 1]?.length ?? 0) + 1;
	return new Range(1, 1, endLine, endColumn);
}

registerSingleton(IQuantumIDEChatInlineEditService, QuantumIDEChatInlineEditService, InstantiationType.Delayed);
