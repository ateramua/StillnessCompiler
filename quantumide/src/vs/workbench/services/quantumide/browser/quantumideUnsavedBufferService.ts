/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { EditorOption } from '../../../../editor/common/config/editorOptions.js';
import { Range } from '../../../../editor/common/core/range.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ITextFileService } from '../../textfile/common/textfiles.js';
import { IEditorService } from '../../editor/common/editorService.js';
import {
	IQuantumIDEUnsavedBufferReadResult,
	IQuantumIDEUnsavedBufferService,
	IQuantumIDEUnsavedBufferWriteResult,
} from '../common/quantumideUnsavedBuffer.js';

export class QuantumIDEUnsavedBufferService implements IQuantumIDEUnsavedBufferService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@ITextModelService private readonly _textModelService: ITextModelService,
		@ITextFileService private readonly _textFiles: ITextFileService,
		@ICodeEditorService private readonly _codeEditorService: ICodeEditorService,
		@IEditorService private readonly _editorService: IEditorService,
	) { }

	async readBuffer(resource: URI | string): Promise<IQuantumIDEUnsavedBufferReadResult | undefined> {
		const uri = typeof resource === 'string' ? URI.parse(resource) : resource;
		const ref = await this._textModelService.createModelReference(uri);
		try {
			const model = ref.object.textEditorModel;
			const dirtyModel = this._textFiles.files.get(uri);
			return {
				uri: uri.toString(),
				content: model.getValue(),
				isDirty: dirtyModel?.isDirty() ?? false,
				lineCount: model.getLineCount(),
			};
		} catch {
			return undefined;
		} finally {
			ref.dispose();
		}
	}

	async writeBuffer(resource: URI | string, content: string, createUndo = true): Promise<IQuantumIDEUnsavedBufferWriteResult> {
		const uri = typeof resource === 'string' ? URI.parse(resource) : resource;
		await this._editorService.openEditor({ resource: uri });
		const ref = await this._textModelService.createModelReference(uri);
		try {
			const model = ref.object.textEditorModel;
			const editor = this._codeEditorService.listCodeEditors().find(e => e.getModel()?.uri.toString() === uri.toString());
			if (editor?.getOption(EditorOption.readOnly)) {
				return { success: false, message: 'Buffer is read-only.' };
			}
			const full = model.getFullModelRange();
			if (createUndo) {
				model.pushStackElement();
			}
			if (editor) {
				editor.executeEdits('quantumideUnsavedBuffer', [{ range: full, text: content, forceMoveMarkers: true }]);
			} else {
				model.applyEdits([{ range: full, text: content }]);
			}
			if (createUndo) {
				model.pushStackElement();
			}
			return { success: true, message: `Updated unsaved buffer (${content.length} chars)`, uri: uri.toString() };
		} catch (err) {
			return { success: false, message: err instanceof Error ? err.message : String(err) };
		} finally {
			ref.dispose();
		}
	}

	async applyPartialEdit(
		resource: URI | string,
		startLine: number,
		startColumn: number,
		endLine: number,
		endColumn: number,
		text: string,
	): Promise<IQuantumIDEUnsavedBufferWriteResult> {
		const uri = typeof resource === 'string' ? URI.parse(resource) : resource;
		await this._editorService.openEditor({ resource: uri });
		const ref = await this._textModelService.createModelReference(uri);
		try {
			const model = ref.object.textEditorModel;
			const range = new Range(startLine, startColumn, endLine, endColumn);
			const editor = this._codeEditorService.listCodeEditors().find(e => e.getModel()?.uri.toString() === uri.toString());
			model.pushStackElement();
			if (editor) {
				editor.executeEdits('quantumideUnsavedBuffer', [{ range, text, forceMoveMarkers: true }]);
			} else {
				model.applyEdits([{ range, text }]);
			}
			model.pushStackElement();
			return { success: true, message: 'Partial edit applied to buffer.', uri: uri.toString() };
		} catch (err) {
			return { success: false, message: err instanceof Error ? err.message : String(err) };
		} finally {
			ref.dispose();
		}
	}
}

registerSingleton(IQuantumIDEUnsavedBufferService, QuantumIDEUnsavedBufferService, InstantiationType.Delayed);
