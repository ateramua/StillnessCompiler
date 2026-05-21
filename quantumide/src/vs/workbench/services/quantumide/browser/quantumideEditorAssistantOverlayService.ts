/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { IOverlayWidget, IOverlayWidgetPosition, OverlayWidgetPositionPreference } from '../../../../editor/browser/editorBrowser.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { QuantumIDEAICommandId } from '../../../../platform/quantumide/common/quantumideAISettings.js';
import { IQuantumIDEInlineDiffService } from './quantumideInlineDiffService.js';

export interface IQuantumIDEEditorAssistantOverlayService {
	readonly _serviceBrand: undefined;
}

export const IQuantumIDEEditorAssistantOverlayService = createDecorator<IQuantumIDEEditorAssistantOverlayService>('quantumIDEEditorAssistantOverlayService');

class AssistantOverlayWidget extends Disposable implements IOverlayWidget {
	private readonly _domNode: HTMLElement;

	constructor(
		_editor: ICodeEditor,
		commands: ICommandService,
		_inlineDiff: IQuantumIDEInlineDiffService,
	) {
		super();
		this._domNode = dom.$('.quantumide-editor-assistant-overlay');
		this._domNode.setAttribute('role', 'toolbar');
		this._domNode.setAttribute('aria-label', localize('quantumide.overlay.aria', 'AI suggestion controls'));
		this._buildButtons(commands);
	}

	getId(): string {
		return 'quantumide.editor.assistant.overlay';
	}

	getDomNode(): HTMLElement {
		return this._domNode;
	}

	getPosition(): IOverlayWidgetPosition | null {
		return {
			preference: OverlayWidgetPositionPreference.BOTTOM_RIGHT_CORNER,
		};
	}

	private _buildButtons(commands: ICommandService): void {
		const add = (label: string, aria: string, command: string) => {
			const btn = dom.$('button.quantumide-overlay-btn', { type: 'button', 'aria-label': aria }, label);
			this._register(dom.addDisposableListener(btn, 'click', e => {
				e.preventDefault();
				e.stopPropagation();
				void commands.executeCommand(command);
			}));
			this._domNode.appendChild(btn);
		};
		add(localize('quantumide.overlay.accept', 'Accept'), localize('quantumide.overlay.acceptAria', 'Accept inline suggestion'), QuantumIDEAICommandId.InlineDiffAccept);
		add(localize('quantumide.overlay.reject', 'Reject'), localize('quantumide.overlay.rejectAria', 'Reject inline suggestion'), QuantumIDEAICommandId.InlineDiffReject);
		add(localize('quantumide.overlay.hunk', 'Hunk'), localize('quantumide.overlay.hunkAria', 'Accept current hunk'), QuantumIDEAICommandId.InlineDiffAcceptHunk);
		add(localize('quantumide.overlay.diff', 'Diff'), localize('quantumide.overlay.diffAria', 'Open side by side diff'), QuantumIDEAICommandId.InlineDiffSideBySide);
	}
}

export class QuantumIDEEditorAssistantOverlayService extends Disposable implements IQuantumIDEEditorAssistantOverlayService {
	declare readonly _serviceBrand: undefined;

	private readonly _widgets = new Map<ICodeEditor, DisposableStore>();

	constructor(
		@ICodeEditorService private readonly _codeEditorService: ICodeEditorService,
		@IQuantumIDEInlineDiffService private readonly _inlineDiff: IQuantumIDEInlineDiffService,
		@ICommandService private readonly _commands: ICommandService,
	) {
		super();
		this._register(this._inlineDiff.onDidChangeProposal(() => this._sync()));
		this._register(this._codeEditorService.onCodeEditorAdd(ed => this._register(ed.onDidDispose(() => this._removeEditor(ed)))));
		this._sync();
	}

	private _sync(): void {
		const proposal = this._inlineDiff.getActiveProposal();
		if (!proposal) {
			for (const [editor, store] of this._widgets) {
				store.dispose();
				this._widgets.delete(editor);
			}
			return;
		}
		const editor = this._codeEditorService.listCodeEditors().find(e => e.getModel()?.uri.toString() === proposal.uri.toString())
			?? this._codeEditorService.getActiveCodeEditor();
		if (!editor) {
			return;
		}
		if (!this._widgets.has(editor)) {
			const store = new DisposableStore();
			const widget = store.add(new AssistantOverlayWidget(editor, this._commands, this._inlineDiff));
			editor.addOverlayWidget(widget);
			store.add({ dispose: () => editor.removeOverlayWidget(widget) });
			this._widgets.set(editor, store);
		}
	}

	private _removeEditor(editor: ICodeEditor): void {
		const store = this._widgets.get(editor);
		if (store) {
			store.dispose();
			this._widgets.delete(editor);
		}
	}
}

registerSingleton(IQuantumIDEEditorAssistantOverlayService, QuantumIDEEditorAssistantOverlayService, InstantiationType.Delayed);
