/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { QuantumIDEAICommandId } from '../../../../platform/quantumide/common/quantumideAISettings.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IChatWidgetService } from '../../../contrib/chat/browser/chat.js';
import { IChatMarkdownContent, type IChatWorkspaceEdit } from '../../../contrib/chat/common/chatService/chatService.js';
import { isResponseVM } from '../../../contrib/chat/common/model/chatViewModel.js';
import { IQuantumIDEChatInlineEditService } from './quantumideChatInlineEditService.js';
import { IQuantumIDEChatInThreadInjectService } from '../common/quantumideChatInThreadInject.js';

export class QuantumIDEChatInThreadInjectService implements IQuantumIDEChatInThreadInjectService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IChatWidgetService private readonly _chatWidgets: IChatWidgetService,
		@IQuantumIDEChatInlineEditService private readonly _edits: IQuantumIDEChatInlineEditService,
		@IWorkspaceContextService private readonly _workspace: IWorkspaceContextService,
	) { }

	injectEditReviewIntoActiveChat(batchLabel: string): void {
		this.injectWorkspaceEditCards(batchLabel);
		const response = this._getActiveResponse();
		if (!response) {
			return;
		}
		const pending = this._edits.getPendingEdits();
		response.model.updateContent({
			kind: 'markdownContent',
			content: new MarkdownString(localize('quantumide.chat.editReviewHeader', '**{0}** — {1} file(s) pending review', batchLabel, pending.length)),
		} satisfies IChatMarkdownContent);
		for (const edit of pending) {
			const lines = this._countLineDelta(edit.originalContent, edit.proposedContent);
			const resource = this._resolveUri(edit.path, edit.resourceUri);
			const openLink = resource
				? `[$(go-to-file) Open](command:quantumide.search.openHit?${encodeURIComponent(JSON.stringify([{ path: edit.path, line: 1 }]))}) `
				: '';
			response.model.updateContent({
				kind: 'markdownContent',
				content: new MarkdownString(
					`$(file) **${edit.path}** (+${lines.added}/-${lines.removed})\n\n`
					+ openLink
					+ `[$(check) Accept](command:${QuantumIDEAICommandId.AcceptPendingEditById}?${encodeURIComponent(JSON.stringify([edit.id]))}) `
					+ `[$(close) Reject](command:${QuantumIDEAICommandId.RejectPendingEditById}?${encodeURIComponent(JSON.stringify([edit.id]))}) `
					+ `[$(diff) Diff](command:quantumide.chat.openUnifiedReview)`,
					{ isTrusted: true },
				),
			} satisfies IChatMarkdownContent);
		}
		response.model.updateContent({
			kind: 'markdownContent',
			content: new MarkdownString(
				`[$(check-all) Accept all](command:${QuantumIDEAICommandId.AcceptPendingChatEdits}) · `
				+ `[$(history) Rollback batch](command:quantumide.chat.rollbackLastBatch) · `
				+ `[$(close-all) Reject all](command:quantumide.chat.rejectAllPending)`,
				{ isTrusted: true },
			),
		} satisfies IChatMarkdownContent);
	}

	injectWorkspaceEditCards(batchLabel: string): void {
		const response = this._getActiveResponse();
		if (!response) {
			return;
		}
		const pending = this._edits.getPendingEdits();
		if (pending.length === 0) {
			return;
		}
		const edits: IChatWorkspaceEdit['edits'] = [];
		for (const edit of pending) {
			const uri = this._resolveUri(edit.path, edit.resourceUri);
			if (!uri) {
				continue;
			}
			const isNew = !edit.originalContent.trim();
			if (isNew) {
				edits.push({ newResource: uri });
			} else {
				edits.push({ oldResource: uri, newResource: uri });
			}
		}
		if (edits.length > 0) {
			response.model.updateContent({
				kind: 'workspaceEdit',
				edits,
			} satisfies IChatWorkspaceEdit);
		}
		void batchLabel;
	}

	injectTerminalBlock(command: string, exitCode: number, output: string): void {
		const response = this._getActiveResponse();
		if (!response) {
			return;
		}
		const ok = exitCode === 0;
		const trimmed = output.slice(0, 6000);
		response.model.updateContent({
			kind: 'markdownContent',
			content: new MarkdownString(
				`### $(terminal) Terminal\n\n\`\`\`shell\n$ ${command}\n\`\`\`\n\n`
				+ `**exit ${exitCode}** ${ok ? '$(check)' : '$(error)'}\n\n\`\`\`\n${trimmed}\n\`\`\``,
				{ isTrusted: true },
			),
		} satisfies IChatMarkdownContent);
	}

	injectTestResults(summary: string, passed: number, failed: number, detail: string): void {
		const response = this._getActiveResponse();
		if (!response) {
			return;
		}
		const icon = failed > 0 ? '$(error)' : '$(check)';
		response.model.updateContent({
			kind: 'markdownContent',
			content: new MarkdownString(
				`### $(beaker) Tests ${icon}\n\n**${summary}** — ${passed} passed, ${failed} failed\n\n`
				+ `[$(debug-restart) Re-run tests](command:quantumide.chat.runWorkspaceTests)\n\n\`\`\`\n${detail.slice(0, 4000)}\n\`\`\``,
				{ isTrusted: true },
			),
		} satisfies IChatMarkdownContent);
	}

	injectExecutionGraphChecklist(checklist: string): void {
		const response = this._getActiveResponse();
		if (!response || !checklist.trim()) {
			return;
		}
		response.model.updateContent({
			kind: 'markdownContent',
			content: new MarkdownString(
				`### $(list-unordered) Agent plan\n\n\`\`\`\n${checklist}\n\`\`\``,
				{ isTrusted: true },
			),
		} satisfies IChatMarkdownContent);
	}

	injectToolConfirmation(title: string, message: string, approveCommand: string, denyCommand?: string): void {
		const response = this._getActiveResponse();
		if (!response) {
			return;
		}
		const deny = denyCommand
			? ` · [$(close) Deny](command:${denyCommand})`
			: '';
		response.model.updateContent({
			kind: 'markdownContent',
			content: new MarkdownString(
				`### $(shield) ${title}\n\n${message}\n\n[$(check) Approve](command:${approveCommand})${deny}`,
				{ isTrusted: true },
			),
		} satisfies IChatMarkdownContent);
	}

	injectInlineSuggestionBar(resourceLabel: string, hunkCount: number): void {
		const response = this._getActiveResponse();
		if (!response) {
			return;
		}
		response.model.updateContent({
			kind: 'markdownContent',
			content: new MarkdownString(
				`### $(lightbulb) Inline suggestion — **${resourceLabel}** (${hunkCount} hunk(s))\n\n`
				+ `[$(check) Accept](command:${QuantumIDEAICommandId.InlineDiffAccept}) · `
				+ `[$(check) Accept hunk](command:${QuantumIDEAICommandId.InlineDiffAcceptHunk}) · `
				+ `[$(close) Reject](command:${QuantumIDEAICommandId.InlineDiffReject}) · `
				+ `[$(diff) Preview](command:${QuantumIDEAICommandId.InlineDiffUnified})`,
				{ isTrusted: true },
			),
		} satisfies IChatMarkdownContent);
	}

	injectBatchReviewSummary(batchCount: number, fileCount: number, paths: readonly string[]): void {
		const response = this._getActiveResponse();
		if (!response) {
			return;
		}
		const list = paths.slice(0, 12).map(p => `- ${p}`).join('\n');
		const more = paths.length > 12 ? `\n- … +${paths.length - 12} more` : '';
		response.model.updateContent({
			kind: 'markdownContent',
			content: new MarkdownString(
				`### $(git-merge) Batch review (${batchCount} batch(es), ${fileCount} file(s))\n\n${list}${more}\n\n`
				+ `[$(list-selection) Review all](command:quantumide.chat.openUnifiedReview) · `
				+ `[$(check-all) Accept all](command:${QuantumIDEAICommandId.AcceptPendingChatEdits}) · `
				+ `[$(close-all) Reject all](command:quantumide.chat.rejectAllPending)`,
				{ isTrusted: true },
			),
		} satisfies IChatMarkdownContent);
	}

	injectRichCodePreview(language: string, code: string, title: string): void {
		const response = this._getActiveResponse();
		if (!response) {
			return;
		}
		const trimmed = code.slice(0, 3000);
		response.model.updateContent({
			kind: 'markdownContent',
			content: new MarkdownString(
				`### $(code) ${title}\n\n\`\`\`${language}\n${trimmed}\n\`\`\`\n\n`
				+ `[$(insert) Apply to editor](command:${QuantumIDEAICommandId.ChatApplyCodeToEditor}) · `
				+ `[$(play) Run](command:${QuantumIDEAICommandId.ChatRunCodeBlock}?${encodeURIComponent(JSON.stringify([language, trimmed]))})`,
				{ isTrusted: true },
			),
		} satisfies IChatMarkdownContent);
	}

	injectCodeBlockRun(language: string, code: string): void {
		const response = this._getActiveResponse();
		if (!response) {
			return;
		}
		const encoded = encodeURIComponent(JSON.stringify([language, code.slice(0, 8000)]));
		response.model.updateContent({
			kind: 'markdownContent',
			content: new MarkdownString(
				`\`\`\`${language}\n${code.slice(0, 2000)}\n\`\`\`\n\n[$(play) Run](command:${QuantumIDEAICommandId.ChatRunCodeBlock}?${encoded})`,
				{ isTrusted: true },
			),
		} satisfies IChatMarkdownContent);
	}

	injectMergeConflictUi(path: string, conflictCount: number): void {
		const response = this._getActiveResponse();
		if (!response) {
			return;
		}
		response.model.updateContent({
			kind: 'markdownContent',
			content: new MarkdownString(
				`### $(git-merge-request) Merge conflicts — **${path}** (${conflictCount} block(s))\n\n`
				+ `[$(arrow-right) Next conflict](command:quantumide.chat.openMergeConflictUi) · `
				+ `[$(check) Accept current](command:quantumide.merge.resolveFromChat) · `
				+ `[$(git-compare) Visual diff](command:quantumide.chat.openUnifiedReview)`,
				{ isTrusted: true },
			),
		} satisfies IChatMarkdownContent);
	}

	injectLiveRefactorPreview(path: string, hunkCount: number): void {
		const response = this._getActiveResponse();
		if (!response) {
			return;
		}
		response.model.updateContent({
			kind: 'markdownContent',
			content: new MarkdownString(
				`### $(lightbulb) Live refactor preview — **${path}** (${hunkCount} hunk(s) in editor)\n\n`
				+ `[$(eye) Preview in editor](command:${QuantumIDEAICommandId.ChatLiveRefactorPreview}) · `
				+ `[$(check) Accept inline](command:${QuantumIDEAICommandId.AcceptPendingChatEdits}) · `
				+ `[$(close) Reject inline](command:quantumide.chat.rejectAllPending)`,
				{ isTrusted: true },
			),
		} satisfies IChatMarkdownContent);
	}

	injectCollabLiveStatus(participantCount: number, activeEditors: readonly string[]): void {
		const response = this._getActiveResponse();
		if (!response) {
			return;
		}
		const editors = activeEditors.slice(0, 5).map(e => `- ${e}`).join('\n');
		const more = activeEditors.length > 5 ? `\n- … +${activeEditors.length - 5} more` : '';
		response.model.updateContent({
			kind: 'markdownContent',
			content: new MarkdownString(
				`### $(live-share) Live collaboration — **${participantCount}** participant(s)\n\n${editors}${more}\n\n`
				+ `[$(sync) Sync session](command:quantumide.chat.collabSync)`,
				{ isTrusted: true },
			),
		} satisfies IChatMarkdownContent);
	}

	private _resolveUri(path: string, resourceUri?: string): URI | undefined {
		if (resourceUri) {
			return URI.parse(resourceUri);
		}
		const root = this._workspace.getWorkspace().folders[0]?.uri;
		return root ? URI.joinPath(root, path.replace(/\\/g, '/').replace(/^\.\//, '')) : undefined;
	}

	private _getActiveResponse() {
		for (const widget of this._chatWidgets.getAllWidgets()) {
			const vm = widget.viewModel;
			if (!vm) {
				continue;
			}
			const items = [...vm.getItems()].reverse();
			for (const item of items) {
				if (isResponseVM(item)) {
					return item;
				}
			}
		}
		return undefined;
	}

	private _countLineDelta(before: string, after: string): { added: number; removed: number } {
		const b = before.split(/\r?\n/).length;
		const a = after.split(/\r?\n/).length;
		return { added: Math.max(0, a - b), removed: Math.max(0, b - a) };
	}
}

registerSingleton(IQuantumIDEChatInThreadInjectService, QuantumIDEChatInThreadInjectService, InstantiationType.Delayed);
