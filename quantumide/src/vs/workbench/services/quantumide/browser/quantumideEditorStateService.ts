/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { basename } from '../../../../base/common/path.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { Range } from '../../../../editor/common/core/range.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { EditorResourceAccessor, SideBySideEditor } from '../../../common/editor.js';
import { IEditorService } from '../../editor/common/editorService.js';

export interface IQuantumIDEEditorCursorState {
	readonly line: number;
	readonly column: number;
}

export interface IQuantumIDEEditorSelectionState {
	readonly startLine: number;
	readonly startColumn: number;
	readonly endLine: number;
	readonly endColumn: number;
	readonly text: string;
	readonly isEmpty: boolean;
}

export interface IQuantumIDEEditorStateSnapshot {
	readonly activeResource?: string;
	readonly activeLabel?: string;
	readonly languageId?: string;
	readonly isActiveEditor: boolean;
	readonly cursor?: IQuantumIDEEditorCursorState;
	readonly selection?: IQuantumIDEEditorSelectionState;
	readonly visibleRange?: { startLine: number; endLine: number };
	readonly openTabs: readonly string[];
}

export interface IQuantumIDEEditorStateService {
	readonly _serviceBrand: undefined;
	getEditorStateSnapshot(): IQuantumIDEEditorStateSnapshot;
	formatEditorStateForContext(maxSelectionChars?: number): string | undefined;
}

export const IQuantumIDEEditorStateService = createDecorator<IQuantumIDEEditorStateService>('quantumIDEEditorStateService');

const MAX_TABS = 12;

export class QuantumIDEEditorStateService implements IQuantumIDEEditorStateService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@ICodeEditorService private readonly _codeEditorService: ICodeEditorService,
		@IEditorService private readonly _editorService: IEditorService,
	) { }

	getEditorStateSnapshot(): IQuantumIDEEditorStateSnapshot {
		const editor = this._codeEditorService.getActiveCodeEditor();
		const model = editor?.getModel();
		const selection = editor?.getSelection();
		const visibleRanges = editor?.getVisibleRanges() ?? [];

		let selectionState: IQuantumIDEEditorSelectionState | undefined;
		if (model && selection) {
			const text = selection.isEmpty()
				? ''
				: model.getValueInRange(new Range(selection.startLineNumber, selection.startColumn, selection.endLineNumber, selection.endColumn));
			selectionState = {
				startLine: selection.startLineNumber,
				startColumn: selection.startColumn,
				endLine: selection.endLineNumber,
				endColumn: selection.endColumn,
				text,
				isEmpty: selection.isEmpty(),
			};
		}

		const openTabs = this._editorService.editors.slice(0, MAX_TABS).map(ed => {
			const resource = EditorResourceAccessor.getCanonicalUri(ed, { supportSideBySide: SideBySideEditor.PRIMARY });
			const active = this._editorService.activeEditor === ed ? ' *' : '';
			return resource ? `${resource.fsPath}${active}` : `${ed.getName()}${active}`;
		});

		return {
			activeResource: model?.uri.toString(),
			activeLabel: model ? basename(model.uri.fsPath) : undefined,
			languageId: model?.getLanguageId(),
			isActiveEditor: !!editor,
			cursor: selection && !selection.isEmpty() ? undefined : selection ? {
				line: selection.positionLineNumber,
				column: selection.positionColumn,
			} : undefined,
			selection: selectionState,
			visibleRange: visibleRanges[0] ? {
				startLine: visibleRanges[0].startLineNumber,
				endLine: visibleRanges[0].endLineNumber,
			} : undefined,
			openTabs,
		};
	}

	formatEditorStateForContext(maxSelectionChars = 4000): string | undefined {
		const snap = this.getEditorStateSnapshot();
		if (!snap.activeResource) {
			return undefined;
		}
		const lines: string[] = [
			`Active file: ${snap.activeLabel ?? snap.activeResource}`,
			`URI: ${snap.activeResource}`,
			`Language: ${snap.languageId ?? 'unknown'}`,
		];
		if (snap.cursor) {
			lines.push(`Cursor: line ${snap.cursor.line}, column ${snap.cursor.column}`);
		}
		if (snap.selection) {
			lines.push(`Selection: ${snap.selection.startLine}:${snap.selection.startColumn}-${snap.selection.endLine}:${snap.selection.endColumn}${snap.selection.isEmpty ? ' (empty)' : ''}`);
			if (!snap.selection.isEmpty && snap.selection.text.trim()) {
				lines.push('Selected text:', snap.selection.text.slice(0, maxSelectionChars));
			}
		}
		if (snap.visibleRange) {
			lines.push(`Visible lines: ${snap.visibleRange.startLine}-${snap.visibleRange.endLine}`);
		}
		if (snap.openTabs.length > 0) {
			lines.push('Open tabs:', ...snap.openTabs.map(t => `- ${t}`));
		}
		return lines.join('\n');
	}
}

registerSingleton(IQuantumIDEEditorStateService, QuantumIDEEditorStateService, InstantiationType.Delayed);
