/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { Selection } from '../../../../editor/common/core/selection.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { QuantumIDEAISettingId } from '../../../../platform/quantumide/common/quantumideAISettings.js';
import { markQuantumIDEPerformanceEnd, markQuantumIDEPerformanceStart, QuantumIDEPerformanceMark } from '../../../../platform/quantumide/common/quantumidePerformanceMarks.js';
import { assertWithinBudget, QuantumIDEPerformanceBudgetMs } from '../../../../platform/quantumide/common/quantumidePerformanceBudgets.js';
import { ChatMessageRole, type IChatMessage, type IChatMessageTextPart, ILanguageModelsService } from '../../../contrib/chat/common/languageModels.js';
import { IQuantumIDEInlineDiffService } from './quantumideInlineDiffService.js';
import { selectQuantumIDELanguageModelForTask } from './quantumideInlineModelSelect.js';
import { IQuantumIDEInlinePrefetchService } from '../common/quantumidePlatformOps.js';

export interface IQuantumIDEInlineEditorContext {
	readonly resource: string;
	readonly languageId: string;
	readonly selectedText: string;
}

export interface IQuantumIDEInlineEditorService {
	readonly _serviceBrand: undefined;
	getActiveSelectionContext(): IQuantumIDEInlineEditorContext | undefined;
	runInlinePrompt(instruction: string, options?: { codeOnly?: boolean }): void;
}

export const IQuantumIDEInlineEditorService = createDecorator<IQuantumIDEInlineEditorService>('quantumIDEInlineEditorService');

function extractSingleCodeBlock(text: string): string | undefined {
	const match = text.match(/```[\w.-]*\n([\s\S]*?)```/);
	return match?.[1]?.trim();
}

export class QuantumIDEInlineEditorService implements IQuantumIDEInlineEditorService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@ICodeEditorService private readonly _codeEditorService: ICodeEditorService,
		@INotificationService private readonly _notificationService: INotificationService,
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
		@IQuantumIDEInlineDiffService private readonly _inlineDiffService: IQuantumIDEInlineDiffService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IQuantumIDEInlinePrefetchService private readonly _prefetch: IQuantumIDEInlinePrefetchService,
	) { }

	getActiveSelectionContext(): IQuantumIDEInlineEditorContext | undefined {
		const editor = this._codeEditorService.getActiveCodeEditor() ?? this._codeEditorService.getFocusedCodeEditor();
		const model = editor?.getModel();
		const selection = editor?.getSelection();
		if (!editor || !model || !selection || selection.isEmpty()) {
			return undefined;
		}
		return {
			resource: model.uri.toString(),
			languageId: model.getLanguageId(),
			selectedText: model.getValueInRange(selection),
		};
	}

	runInlinePrompt(instruction: string, options: { codeOnly?: boolean } = {}): void {
		if (this._configurationService.getValue<boolean>(QuantumIDEAISettingId.ChatInlineEnabled) === false) {
			this._notificationService.info(localize('quantumide.inline.disabled', 'Inline AI is disabled in QuantumIDE settings.'));
			return;
		}
		markQuantumIDEPerformanceStart(QuantumIDEPerformanceMark.InlineCompletion);
		const active = this.getActiveSelectionContext();
		if (!active) {
			this._notificationService.info(localize('quantumide.inline.noSelection', 'Select code before running an inline AI command.'));
			return;
		}
		const editor = this._codeEditorService.getActiveCodeEditor() ?? this._codeEditorService.getFocusedCodeEditor();
		const sel = editor?.getSelection();
		const selKey = sel ? `${sel.startLineNumber}:${sel.startColumn}` : '0';
		const cached = this._prefetch.getCached(active.resource, selKey);
		if (cached && editor && sel && !sel.isEmpty()) {
			this._inlineDiffService.showProposal(URI.parse(active.resource), sel, active.selectedText, cached);
			this._notificationService.info(localize('quantumide.inline.prefetchHit', 'Showing prefetched inline suggestion — accept or reject in the editor.'));
			return;
		}
		void this._runInlineWithModel(active, instruction, options.codeOnly !== false);
	}

	private async _runInlineWithModel(active: IQuantumIDEInlineEditorContext, instruction: string, codeOnly: boolean): Promise<void> {
		const editor = this._codeEditorService.getActiveCodeEditor() ?? this._codeEditorService.getFocusedCodeEditor();
		const model = editor?.getModel();
		const selection = editor?.getSelection();
		if (!editor || !model || !selection) {
			return;
		}
		const cts = new CancellationTokenSource();
		try {
			const modelId = await selectQuantumIDELanguageModelForTask(this._languageModelsService, this._configurationService, 'inline');
			if (!modelId) {
				this._notificationService.warn(localize('quantumide.inline.noModel', 'No language model is available for inline AI.'));
				return;
			}
			const userText = [
				'You are QuantumIDE inline AI embedded in the editor.',
				instruction,
				codeOnly ? 'Return only the replacement code in a single fenced code block.' : '',
				`Resource: ${active.resource}`,
				`Language: ${active.languageId}`,
				'',
				'Selected code:',
				'```',
				active.selectedText,
				'```',
			].filter(Boolean).join('\n');
			const messages: IChatMessage[] = [{
				role: ChatMessageRole.User,
				content: [{ type: 'text', value: userText } satisfies IChatMessageTextPart],
			}];
			const response = await this._languageModelsService.sendChatRequest(modelId, undefined, messages, {}, cts.token);
			const text = await this._streamInlineSuggestion(active, selection, response);
			const proposed = extractSingleCodeBlock(text) ?? text.trim();
			if (!proposed) {
				this._notificationService.warn(localize('quantumide.inline.emptyResponse', 'The model returned an empty inline edit.'));
				return;
			}
			this._inlineDiffService.showProposal(URI.parse(active.resource), selection, active.selectedText, proposed);
			this._prefetch.setCached(active.resource, `${selection.startLineNumber}:${selection.startColumn}`, proposed);
			this._notificationService.info(localize('quantumide.inline.diffReady', 'Inline diff ready — accept or reject hunks in the editor.'));
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this._notificationService.error(localize('quantumide.inline.failed', 'Inline AI failed: {0}', message));
		} finally {
			cts.dispose();
			const elapsed = markQuantumIDEPerformanceEnd(QuantumIDEPerformanceMark.InlineCompletion) ?? 0;
			assertWithinBudget('inlineCompletion', elapsed, QuantumIDEPerformanceBudgetMs.inlineCompletion);
		}
	}

	private async _streamInlineSuggestion(
		active: IQuantumIDEInlineEditorContext,
		selection: Selection,
		response: import('../../../contrib/chat/common/languageModels.js').ILanguageModelChatResponse,
	): Promise<string> {
		let streamed = '';
		let lastShown = '';
		const maybeShow = () => {
			const proposed = extractSingleCodeBlock(streamed) ?? streamed.trim();
			if (!proposed || proposed === lastShown) {
				return;
			}
			lastShown = proposed;
			this._inlineDiffService.showProposal(URI.parse(active.resource), selection, active.selectedText, proposed);
		};

		const consume = (value: string) => {
			if (!value) {
				return;
			}
			streamed += value;
			// Update frequently enough for visible streaming, but avoid rerender on every token.
			if (value.includes('\n') || streamed.length - lastShown.length > 80) {
				maybeShow();
			}
		};

		const streamTask = (async () => {
			for await (const part of response.stream) {
				if (Array.isArray(part)) {
					for (const item of part) {
						if (item.type === 'text') {
							consume(item.value);
						}
					}
				} else if (part.type === 'text') {
					consume(part.value);
				}
			}
		})();

		try {
			await Promise.all([response.result, streamTask]);
		} catch {
			// Keep partial stream output if available.
		}
		maybeShow();
		return streamed;
	}
}

registerSingleton(IQuantumIDEInlineEditorService, QuantumIDEInlineEditorService, InstantiationType.Delayed);
