/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from '../../../../base/common/async.js';
import { URI } from '../../../../base/common/uri.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { Range } from '../../../../editor/common/core/range.js';
import { Selection } from '../../../../editor/common/core/selection.js';
import { ScrollType } from '../../../../editor/common/editorCommon.js';
import { TrackedRangeStickiness } from '../../../../editor/common/model.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IEditorService } from '../../editor/common/editorService.js';
import { IEditorGroupsService } from '../../editor/common/editorGroupsService.js';
import {
	IQuantumIDEEditorManipulationRequest,
	IQuantumIDEEditorManipulationResult,
	IQuantumIDEEditorManipulationService,
} from '../common/quantumideEditorManipulation.js';

const HIGHLIGHT_CLASS = 'quantumide-editor-highlight-range';

export class QuantumIDEEditorManipulationService implements IQuantumIDEEditorManipulationService {
	declare readonly _serviceBrand: undefined;

	private _highlightDecorationIds: string[] = [];

	constructor(
		@ICodeEditorService private readonly _codeEditorService: ICodeEditorService,
		@IEditorService private readonly _editorService: IEditorService,
		@IEditorGroupsService private readonly _editorGroups: IEditorGroupsService,
	) { }

	async manipulate(request: IQuantumIDEEditorManipulationRequest): Promise<IQuantumIDEEditorManipulationResult> {
		const uri = await this._resolveResource(request.resource);
		if (request.action === 'close_editor') {
			if (!uri) {
				const active = this._editorService.activeEditor;
				if (active) {
					const groupId = this._editorGroups.activeGroup.id;
					await this._editorService.closeEditor({ editor: active, groupId });
					return { success: true, message: 'Closed active editor.' };
				}
				return { success: false, message: 'No editor to close.' };
			}
			const editors = this._editorService.findEditors(uri);
			for (const { editor, groupId } of editors) {
				await this._editorService.closeEditor({ editor, groupId });
			}
			return { success: true, message: `Closed editor(s) for ${uri.fsPath}`, resource: uri.toString() };
		}

		if (request.action === 'open_file') {
			if (!uri) {
				return { success: false, message: 'open_file requires resource.' };
			}
			await this._editorService.openEditor({
				resource: uri,
				options: {
					selection: request.line
						? { startLineNumber: request.line, startColumn: request.column ?? 1, endLineNumber: request.line, endColumn: request.column ?? 1 }
						: undefined,
					preserveFocus: request.preserveFocus === true,
				},
			});
			return { success: true, message: `Opened ${uri.fsPath}`, resource: uri.toString() };
		}

		const editor = await this._ensureEditor(uri);
		if (!editor) {
			return { success: false, message: 'No editor available for manipulation.' };
		}
		const model = editor.getModel();
		if (!model) {
			return { success: false, message: 'Editor has no text model.' };
		}

		switch (request.action) {
			case 'set_cursor': {
				const line = request.line ?? 1;
				const column = request.column ?? 1;
				editor.setPosition({ lineNumber: line, column }, 'quantumideManipulate');
				editor.revealPositionInCenter({ lineNumber: line, column }, ScrollType.Immediate);
				return { success: true, message: `Cursor at ${line}:${column}`, resource: model.uri.toString() };
			}
			case 'set_selection': {
				const startLine = request.line ?? 1;
				const startColumn = request.column ?? 1;
				const endLine = request.endLine ?? startLine;
				const endColumn = request.endColumn ?? startColumn;
				const sel = new Selection(startLine, startColumn, endLine, endColumn);
				editor.setSelection(sel, 'quantumideManipulate');
				editor.revealRangeInCenter(sel, ScrollType.Immediate);
				return { success: true, message: `Selection ${startLine}:${startColumn}-${endLine}:${endColumn}`, resource: model.uri.toString() };
			}
			case 'set_selections': {
				const sels = (request.selections ?? []).map(s =>
					new Selection(s.startLine, s.startColumn, s.endLine, s.endColumn));
				if (sels.length === 0) {
					return { success: false, message: 'set_selections requires selections array.' };
				}
				editor.setSelections(sels, 'quantumideManipulate');
				editor.revealRangeInCenter(sels[0], ScrollType.Immediate);
				return { success: true, message: `${sels.length} selection(s) set`, resource: model.uri.toString() };
			}
			case 'add_cursor': {
				const line = request.line ?? 1;
				const column = request.column ?? 1;
				const existing = editor.getSelections() ?? [];
				const next = [...existing, new Selection(line, column, line, column)];
				editor.setSelections(next, 'quantumideManipulate');
				return { success: true, message: `Added cursor at ${line}:${column}`, resource: model.uri.toString() };
			}
			case 'reveal_line': {
				const line = request.line ?? 1;
				editor.revealLine(line, ScrollType.Immediate);
				return { success: true, message: `Revealed line ${line}`, resource: model.uri.toString() };
			}
			case 'reveal_line_center': {
				const line = request.line ?? 1;
				editor.revealLineInCenter(line, ScrollType.Immediate);
				return { success: true, message: `Revealed line ${line} (center)`, resource: model.uri.toString() };
			}
			case 'highlight_range': {
				const startLine = request.line ?? 1;
				const startColumn = request.column ?? 1;
				const endLine = request.endLine ?? startLine;
				const endColumn = request.endColumn ?? model.getLineMaxColumn(endLine);
				const range = new Range(startLine, startColumn, endLine, endColumn);
				if (this._highlightDecorationIds.length > 0) {
					editor.deltaDecorations(this._highlightDecorationIds, []);
					this._highlightDecorationIds = [];
				}
				this._highlightDecorationIds = editor.deltaDecorations([], [{
					range,
					options: {
						description: 'quantumide-highlight',
						className: HIGHLIGHT_CLASS,
						isWholeLine: startLine !== endLine || startColumn === 1,
						stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
					},
				}]);
				editor.revealRangeInCenter(range, ScrollType.Immediate);
				void timeout(4000).then(() => {
					if (this._highlightDecorationIds.length > 0) {
						editor.deltaDecorations(this._highlightDecorationIds, []);
						this._highlightDecorationIds = [];
					}
				});
				return { success: true, message: `Highlighted ${startLine}:${startColumn}-${endLine}:${endColumn}`, resource: model.uri.toString() };
			}
			default:
				return { success: false, message: `Unknown action: ${String(request.action)}` };
		}
	}

	private async _resolveResource(resource?: URI | string): Promise<URI | undefined> {
		if (!resource) {
			const active = this._codeEditorService.getActiveCodeEditor()?.getModel()?.uri;
			return active;
		}
		return typeof resource === 'string' ? URI.parse(resource) : resource;
	}

	private async _ensureEditor(uri: URI | undefined) {
		if (uri) {
			await this._editorService.openEditor({ resource: uri });
			const editors = this._codeEditorService.listCodeEditors();
			return editors.find(e => e.getModel()?.uri.toString() === uri.toString())
				?? this._codeEditorService.getActiveCodeEditor();
		}
		return this._codeEditorService.getActiveCodeEditor() ?? this._codeEditorService.getFocusedCodeEditor();
	}
}

registerSingleton(IQuantumIDEEditorManipulationService, QuantumIDEEditorManipulationService, InstantiationType.Delayed);
