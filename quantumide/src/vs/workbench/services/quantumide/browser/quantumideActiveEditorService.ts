/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { EditorOption } from '../../../../editor/common/config/editorOptions.js';
import { Range } from '../../../../editor/common/core/range.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export type QuantumIDEActiveEditorEditMode = 'insert_at_cursor' | 'replace_selection' | 'insert_after_selection';

export interface IQuantumIDEActiveEditorEditRequest {
	readonly mode: QuantumIDEActiveEditorEditMode;
	readonly text: string;
}

export interface IQuantumIDEActiveEditorEditResult {
	readonly applied: boolean;
	readonly resource?: string;
	readonly rangeLabel?: string;
	readonly message: string;
}

export interface IQuantumIDEActiveEditorService {
	readonly _serviceBrand: undefined;
	editActiveEditor(request: IQuantumIDEActiveEditorEditRequest): IQuantumIDEActiveEditorEditResult;
}

export const IQuantumIDEActiveEditorService = createDecorator<IQuantumIDEActiveEditorService>('quantumIDEActiveEditorService');

export class QuantumIDEActiveEditorService implements IQuantumIDEActiveEditorService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@ICodeEditorService private readonly _codeEditorService: ICodeEditorService,
	) { }

	editActiveEditor(request: IQuantumIDEActiveEditorEditRequest): IQuantumIDEActiveEditorEditResult {
		const editor = this._codeEditorService.getActiveCodeEditor() ?? this._codeEditorService.getFocusedCodeEditor();
		const model = editor?.getModel();
		if (!editor || !model) {
			return { applied: false, message: 'No active text editor.' };
		}
		const selection = editor.getSelection();
		if (!selection) {
			return { applied: false, message: 'No cursor position in the active editor.' };
		}

		let range: Range;
		switch (request.mode) {
			case 'insert_at_cursor':
				range = new Range(selection.positionLineNumber, selection.positionColumn, selection.positionLineNumber, selection.positionColumn);
				break;
			case 'replace_selection':
				if (selection.isEmpty()) {
					return { applied: false, message: 'replace_selection requires a non-empty selection.' };
				}
				range = new Range(selection.startLineNumber, selection.startColumn, selection.endLineNumber, selection.endColumn);
				break;
			case 'insert_after_selection':
				range = new Range(selection.endLineNumber, selection.endColumn, selection.endLineNumber, selection.endColumn);
				break;
			default:
				return { applied: false, message: `Unknown edit mode: ${String(request.mode)}` };
		}

		if (editor.getOption(EditorOption.readOnly)) {
			return { applied: false, message: 'Active editor is read-only.' };
		}

		model.pushStackElement();
		editor.executeEdits('quantumideActiveEditor', [{
			range,
			text: request.text,
			forceMoveMarkers: true,
		}]);
		model.pushStackElement();
		editor.revealRangeInCenter(range);
		return {
			applied: true,
			resource: model.uri.toString(),
			rangeLabel: `${range.startLineNumber}:${range.startColumn}-${range.endLineNumber}:${range.endColumn}`,
			message: `Applied ${request.mode} in ${model.uri.fsPath}`,
		};
	}
}

registerSingleton(IQuantumIDEActiveEditorService, QuantumIDEActiveEditorService, InstantiationType.Delayed);
