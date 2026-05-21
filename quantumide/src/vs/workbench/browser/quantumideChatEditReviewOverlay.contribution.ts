/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../base/browser/dom.js';
import { Disposable, DisposableStore } from '../../base/common/lifecycle.js';
import { localize } from '../../nls.js';
import { isQuantumIDEProduct } from '../../platform/quantumide/common/quantumideChatPlatform.js';
import product from '../../platform/product/common/product.js';
import { ICommandService } from '../../platform/commands/common/commands.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../common/contributions.js';
import { IChatWidget, IChatWidgetService } from '../contrib/chat/browser/chat.js';
import { IQuantumIDEChatInlineEditService } from '../services/quantumide/browser/quantumideChatInlineEditService.js';
import { QuantumIDEAICommandId } from '../../platform/quantumide/common/quantumideAISettings.js';

function isQuantumIDE(): boolean {
	return isQuantumIDEProduct(product.applicationName)
		|| [product.nameShort, product.nameLong].some(n => typeof n === 'string' && n.toLowerCase().includes('quantumide'));
}

class QuantumIDEChatEditReviewOverlayContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.quantumideChatEditReviewOverlay';

	private readonly _widgetBars = new Map<IChatWidget, { bar: HTMLElement; store: DisposableStore }>();

	constructor(
		@IChatWidgetService private readonly _chatWidgets: IChatWidgetService,
		@IQuantumIDEChatInlineEditService private readonly _edits: IQuantumIDEChatInlineEditService,
		@ICommandService private readonly _commands: ICommandService,
	) {
		super();
		if (!isQuantumIDE()) {
			return;
		}
		for (const widget of this._chatWidgets.getAllWidgets()) {
			this._attach(widget);
		}
		this._register(this._chatWidgets.onDidAddWidget(w => this._attach(w)));
		this._register(this._edits.onDidChangePending(() => {
			for (const widget of this._chatWidgets.getAllWidgets()) {
				this._render(widget);
			}
		}));
	}

	private _attach(widget: IChatWidget): void {
		if (this._widgetBars.has(widget)) {
			return;
		}
		const inputEl = widget.inputPart.inputContainerElement;
		if (!inputEl?.parentElement) {
			return;
		}
		const bar = dom.$('.quantumide-chat-edit-review-bar');
		bar.style.cssText = 'display:flex;flex-direction:column;gap:4px;padding:6px 8px;border-bottom:1px solid var(--vscode-panel-border);background:var(--vscode-editor-background);max-height:160px;overflow:auto;';
		inputEl.parentElement.insertBefore(bar, inputEl);
		const store = new DisposableStore();
		this._widgetBars.set(widget, { bar, store });
		this._render(widget);
		this._register({ dispose: () => { bar.remove(); this._widgetBars.delete(widget); } });
	}

	private _render(widget: IChatWidget): void {
		const entry = this._widgetBars.get(widget);
		if (!entry) {
			return;
		}
		dom.clearNode(entry.bar);
		const pending = this._edits.getPendingEdits();
		if (pending.length === 0) {
			entry.bar.style.display = 'none';
			return;
		}
		entry.bar.style.display = 'flex';
		const header = dom.append(entry.bar, dom.$('div'));
		header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:11px;font-weight:600;';
		dom.append(header, dom.$('span')).textContent = localize('quantumide.editReview.title', 'Review agent edits ({0} files)', pending.length);
		const actions = dom.append(header, dom.$('div'));
		actions.style.cssText = 'display:flex;gap:6px;';
		this._linkButton(actions, localize('quantumide.editReview.acceptAll', 'Accept all'), () => void this._commands.executeCommand(QuantumIDEAICommandId.AcceptPendingChatEdits));
		this._linkButton(actions, localize('quantumide.editReview.rejectAll', 'Reject all'), () => this._commands.executeCommand('quantumide.chat.rejectAllPending'));
		this._linkButton(actions, localize('quantumide.editReview.openDiff', 'Open diff'), () => void this._commands.executeCommand('quantumide.chat.openUnifiedReview'));

		for (const edit of pending.slice(0, 12)) {
			const row = dom.append(entry.bar, dom.$('div'));
			row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:11px;';
			dom.append(row, dom.$('span')).textContent = edit.path;
			const rowActions = dom.append(row, dom.$('div'));
			rowActions.style.cssText = 'display:flex;gap:6px;';
			this._linkButton(rowActions, localize('accept', 'Accept'), () => void this._commands.executeCommand(QuantumIDEAICommandId.AcceptPendingEditById, edit.id));
			this._linkButton(rowActions, localize('reject', 'Reject'), () => this._commands.executeCommand(QuantumIDEAICommandId.RejectPendingEditById, edit.id));
		}
		if (pending.length > 12) {
			dom.append(entry.bar, dom.$('span')).textContent = localize('quantumide.editReview.more', '+{0} more…', pending.length - 12);
		}
	}

	private _linkButton(parent: HTMLElement, label: string, run: () => void): void {
		const btn = dom.append(parent, dom.$('a'));
		btn.textContent = label;
		btn.style.cssText = 'cursor:pointer;color:var(--vscode-textLink-foreground);text-decoration:none;';
		btn.onclick = (e) => { e.preventDefault(); run(); };
	}
}

registerWorkbenchContribution2(QuantumIDEChatEditReviewOverlayContribution.ID, QuantumIDEChatEditReviewOverlayContribution, WorkbenchPhase.AfterRestored);
