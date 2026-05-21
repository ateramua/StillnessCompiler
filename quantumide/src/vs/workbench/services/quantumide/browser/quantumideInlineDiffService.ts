/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { Range } from '../../../../editor/common/core/range.js';
import { IModelDeltaDecoration, TrackedRangeStickiness } from '../../../../editor/common/model.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { applyHunkToText, buildUnifiedDiffText, computeLineDiffHunks, mergeTextWithAcceptedHunks, type IQuantumIDEDiffHunk } from '../../../../platform/quantumide/common/quantumideDiffHunks.js';
import {
	allHunksAccepted,
	buildInlineHunkDispositions,
	type IQuantumIDEInlineSuggestionStateSnapshot,
	remainingPendingHunkIndices,
} from '../../../../platform/quantumide/common/quantumideInlineSuggestionState.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { QuantumIDEAISettingId } from '../../../../platform/quantumide/common/quantumideAISettings.js';
import { markQuantumIDEPerformanceEnd, markQuantumIDEPerformanceStart, QuantumIDEPerformanceMark } from '../../../../platform/quantumide/common/quantumidePerformanceMarks.js';
import { assertWithinBudget, QuantumIDEPerformanceBudgetMs } from '../../../../platform/quantumide/common/quantumidePerformanceBudgets.js';
import { IEditorService } from '../../editor/common/editorService.js';

export interface IQuantumIDEInlineDiffProposal {
	readonly id: string;
	readonly uri: URI;
	readonly range: Range;
	readonly originalText: string;
	readonly proposedText: string;
	readonly hunks: readonly IQuantumIDEDiffHunk[];
}

export interface IQuantumIDEInlineDiffService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeProposal: import('../../../../base/common/event.js').Event<void>;
	getActiveProposal(): IQuantumIDEInlineDiffProposal | undefined;
	getHunks(): readonly IQuantumIDEDiffHunk[];
	showProposal(uri: URI, range: Range, originalText: string, proposedText: string): string;
	acceptProposal(): boolean;
	rejectProposal(): void;
	acceptCurrentHunk(): boolean;
	acceptAllHunks(): boolean;
	rejectAllRemainingHunks(): void;
	getSuggestionState(): IQuantumIDEInlineSuggestionStateSnapshot | undefined;
	openSideBySidePreview(): Promise<void>;
	openUnifiedDiffPreview(): Promise<void>;
	setHunkComment(hunkIndex: number, comment: string): void;
	getHunkComments(): ReadonlyMap<number, string>;
	getActiveHunkIndex(): number;
}

export const IQuantumIDEInlineDiffService = createDecorator<IQuantumIDEInlineDiffService>('quantumIDEInlineDiffService');

export class QuantumIDEInlineDiffService extends Disposable implements IQuantumIDEInlineDiffService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeProposal = this._register(new Emitter<void>());
	readonly onDidChangeProposal = this._onDidChangeProposal.event;

	private _proposal: IQuantumIDEInlineDiffProposal | undefined;
	private _acceptedHunks = new Set<number>();
	private _rejectedHunks = new Set<number>();
	private _bulkAccepted = false;
	private _bulkRejected = false;
	private _decorationIds: string[] = [];
	private _decorationDisposable: IDisposable | undefined;
	private _activeHunkIndex = 0;
	private _hunkComments = new Map<number, string>();

	constructor(
		@ICodeEditorService private readonly _codeEditorService: ICodeEditorService,
		@IEditorService private readonly _editorService: IEditorService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super();
	}

	getActiveProposal(): IQuantumIDEInlineDiffProposal | undefined {
		return this._proposal;
	}

	getHunks(): readonly IQuantumIDEDiffHunk[] {
		return this._proposal?.hunks ?? [];
	}

	showProposal(uri: URI, range: Range, originalText: string, proposedText: string): string {
		markQuantumIDEPerformanceStart(QuantumIDEPerformanceMark.InlineDiffRender);
		this.rejectProposal();
		const id = `inline-${Date.now()}`;
		const hunks = computeLineDiffHunks(originalText, proposedText);
		this._acceptedHunks = new Set();
		this._rejectedHunks = new Set();
		this._bulkAccepted = false;
		this._bulkRejected = false;
		this._hunkComments = new Map();
		this._proposal = { id, uri, range, originalText, proposedText, hunks };
		this._activeHunkIndex = 0;
		this._renderDecorations();
		this._onDidChangeProposal.fire();
		const elapsed = markQuantumIDEPerformanceEnd(QuantumIDEPerformanceMark.InlineDiffRender) ?? 0;
		assertWithinBudget('diffRendering', elapsed, QuantumIDEPerformanceBudgetMs.diffRendering);
		return id;
	}

	async openSideBySidePreview(): Promise<void> {
		const proposal = this._proposal;
		if (!proposal) {
			return;
		}
		const proposed = mergeTextWithAcceptedHunks(proposal.originalText, proposal.proposedText, this._acceptedHunks);
		if (this._configurationService.getValue<boolean>(QuantumIDEAISettingId.ChatDiffSideBySide) !== false) {
			await this._openResourceDiffPreview(proposal.uri, proposal.originalText, proposed);
			return;
		}
		await this._editorService.openEditor({
			resource: undefined,
			contents: `--- original\n+++ proposed\n${proposed}`,
			languageId: 'diff',
			options: { pinned: true },
		});
	}

	private async _openResourceDiffPreview(uri: URI, original: string, modified: string): Promise<void> {
		const originalUri = URI.from({ scheme: 'untitled', path: `${uri.fsPath}.original` });
		const modifiedUri = URI.from({ scheme: 'untitled', path: `${uri.fsPath}.proposed` });
		await this._editorService.openEditor({
			original: { resource: originalUri, contents: original },
			modified: { resource: modifiedUri, contents: modified },
			label: uri.fsPath,
			options: { pinned: true },
		});
	}

	async openUnifiedDiffPreview(): Promise<void> {
		const proposal = this._proposal;
		if (!proposal) {
			return;
		}
		const proposed = mergeTextWithAcceptedHunks(proposal.originalText, proposal.proposedText, this._acceptedHunks);
		let unified = buildUnifiedDiffText('original', 'proposed', proposal.originalText, proposed);
		for (const [index, comment] of this._hunkComments) {
			if (comment.trim()) {
				unified += `\n# comment hunk ${index}: ${comment.trim()}`;
			}
		}
		await this._editorService.openEditor({
			resource: undefined,
			contents: unified,
			languageId: 'diff',
			options: { pinned: true },
		});
	}

	setHunkComment(hunkIndex: number, comment: string): void {
		if (!comment.trim()) {
			this._hunkComments.delete(hunkIndex);
		} else {
			this._hunkComments.set(hunkIndex, comment.trim());
		}
		this._onDidChangeProposal.fire();
	}

	getHunkComments(): ReadonlyMap<number, string> {
		return this._hunkComments;
	}

	getActiveHunkIndex(): number {
		return this._activeHunkIndex;
	}

	getSuggestionState(): IQuantumIDEInlineSuggestionStateSnapshot | undefined {
		const proposal = this._proposal;
		if (!proposal) {
			return undefined;
		}
		return {
			proposalId: proposal.id,
			hunks: buildInlineHunkDispositions(proposal.hunks.length, this._acceptedHunks, this._rejectedHunks),
			bulkAccepted: this._bulkAccepted,
			bulkRejected: this._bulkRejected,
		};
	}

	acceptAllHunks(): boolean {
		const proposal = this._proposal;
		if (!proposal || proposal.hunks.length === 0) {
			return this.acceptProposal();
		}
		this._bulkAccepted = true;
		for (const h of proposal.hunks) {
			this._acceptedHunks.add(h.index);
		}
		return this.acceptProposal();
	}

	rejectAllRemainingHunks(): void {
		const proposal = this._proposal;
		if (!proposal) {
			return;
		}
		this._bulkRejected = true;
		for (const i of remainingPendingHunkIndices(proposal.hunks.length, this._acceptedHunks, this._rejectedHunks)) {
			this._rejectedHunks.add(i);
		}
		if (allHunksAccepted(proposal.hunks.length, this._acceptedHunks) || this._rejectedHunks.size + this._acceptedHunks.size >= proposal.hunks.length) {
			this.rejectProposal();
			return;
		}
		this._onDidChangeProposal.fire();
	}

	acceptProposal(): boolean {
		const proposal = this._proposal;
		if (!proposal) {
			return false;
		}
		const editor = this._findEditorForUri(proposal.uri);
		if (!editor) {
			return false;
		}
		const text = mergeTextWithAcceptedHunks(proposal.originalText, proposal.proposedText, new Set(proposal.hunks.map(h => h.index)));
		editor.pushUndoStop();
		const ok = editor.executeEdits('quantumide.inline.diffAccept', [{ range: proposal.range, text }]);
		editor.pushUndoStop();
		this.rejectProposal();
		return ok;
	}

	acceptCurrentHunk(): boolean {
		const proposal = this._proposal;
		if (!proposal || proposal.hunks.length === 0) {
			return this.acceptProposal();
		}
		const hunk = proposal.hunks[this._activeHunkIndex];
		if (!hunk) {
			return false;
		}
		const editor = this._findEditorForUri(proposal.uri);
		const model = editor?.getModel();
		if (!editor || !model) {
			return false;
		}
		const merged = applyHunkToText(model.getValue(), proposal.hunks, hunk.index);
		if (merged === undefined) {
			return false;
		}
		editor.pushUndoStop();
		const fullRange = model.getFullModelRange();
		editor.executeEdits('quantumide.inline.acceptHunk', [{ range: fullRange, text: merged }]);
		editor.pushUndoStop();
		this._acceptedHunks.add(hunk.index);
		const nextOriginal = merged;
		const remainingHunks = computeLineDiffHunks(nextOriginal, proposal.proposedText);
		this._proposal = {
			...proposal,
			originalText: nextOriginal,
			range: model.getFullModelRange(),
			hunks: remainingHunks,
		};
		this._activeHunkIndex = 0;
		if (remainingHunks.length === 0) {
			this.rejectProposal();
			return true;
		}
		this._renderDecorations();
		this._onDidChangeProposal.fire();
		return true;
	}

	rejectProposal(): void {
		const uri = this._proposal?.uri;
		this._proposal = undefined;
		this._acceptedHunks.clear();
		this._rejectedHunks.clear();
		this._bulkAccepted = false;
		this._bulkRejected = false;
		this._activeHunkIndex = 0;
		this._clearDecorations(uri);
		this._onDidChangeProposal.fire();
	}

	private _findEditorForUri(uri: URI) {
		const active = this._codeEditorService.getActiveCodeEditor();
		if (active?.getModel()?.uri.toString() === uri.toString()) {
			return active;
		}
		for (const editor of this._codeEditorService.listCodeEditors()) {
			if (editor.getModel()?.uri.toString() === uri.toString()) {
				return editor;
			}
		}
		return undefined;
	}

	private _renderDecorations(): void {
		const proposal = this._proposal;
		if (!proposal) {
			return;
		}
		const editor = this._findEditorForUri(proposal.uri);
		const model = editor?.getModel();
		if (!editor || !model) {
			return;
		}
		this._clearDecorations(proposal.uri);
		const hunk = proposal.hunks[this._activeHunkIndex];
		const decorations: IModelDeltaDecoration[] = [];
		const ghostEnabled = this._configurationService.getValue<boolean>(QuantumIDEAISettingId.ChatInlineGhostText) === true;
		if (hunk) {
			const start = proposal.range.startLineNumber + hunk.originalStart;
			const endLine = start + Math.max(0, hunk.originalLines.length - 1);
			const comment = this._hunkComments.get(hunk.index);
			if (ghostEnabled && hunk.proposedLines.length > 0) {
				decorations.push({
					range: new Range(endLine, model.getLineMaxColumn(endLine), endLine, model.getLineMaxColumn(endLine)),
					options: {
						after: {
							content: ` ${hunk.proposedLines[0].slice(0, 120)}`,
							inlineClassName: 'quantumide-inline-diff-ghost',
						},
						description: 'quantumide-inline-diff-ghost',
					},
				});
			}
			decorations.push({
				range: new Range(start, 1, endLine, model.getLineMaxColumn(endLine)),
				options: {
					className: 'quantumide-inline-diff-removed',
					description: 'quantumide-inline-diff-hunk',
					stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
					...(comment ? {
						after: {
							content: ` 💬 ${comment}`,
							inlineClassName: 'quantumide-inline-diff-hunk-comment',
						},
					} : {}),
				},
			});
		} else {
			decorations.push({
				range: proposal.range,
				options: {
					className: 'quantumide-inline-diff-added',
					description: 'quantumide-inline-diff-added',
					stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
				},
			});
		}
		this._decorationIds = model.deltaDecorations([], decorations);
		this._decorationDisposable = editor.onDidDispose(() => this.rejectProposal());
	}

	private _clearDecorations(uri?: URI): void {
		this._decorationDisposable?.dispose();
		this._decorationDisposable = undefined;
		if (!uri || this._decorationIds.length === 0) {
			this._decorationIds = [];
			return;
		}
		const editor = this._findEditorForUri(uri);
		const model = editor?.getModel();
		if (model) {
			model.deltaDecorations(this._decorationIds, []);
		}
		this._decorationIds = [];
	}
}

registerSingleton(IQuantumIDEInlineDiffService, QuantumIDEInlineDiffService, InstantiationType.Delayed);
