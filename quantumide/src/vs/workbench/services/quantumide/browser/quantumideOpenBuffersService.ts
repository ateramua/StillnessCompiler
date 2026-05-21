/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../../base/common/network.js';
import { basename } from '../../../../base/common/path.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { EditorResourceAccessor, SideBySideEditor } from '../../../common/editor.js';
import { IEditorService } from '../../editor/common/editorService.js';
import { ITextFileService } from '../../textfile/common/textfiles.js';
import {
	IQuantumIDEOpenBufferInfo,
	IQuantumIDEOpenBuffersService,
	IQuantumIDEOpenBuffersSnapshot,
} from '../common/quantumideOpenBuffers.js';

const DEFAULT_PREVIEW = 2000;

export class QuantumIDEOpenBuffersService implements IQuantumIDEOpenBuffersService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IEditorService private readonly _editorService: IEditorService,
		@ITextFileService private readonly _textFiles: ITextFileService,
		@IModelService private readonly _modelService: IModelService,
	) { }

	getSnapshot(maxPreviewChars = DEFAULT_PREVIEW): IQuantumIDEOpenBuffersSnapshot {
		const activeUri = EditorResourceAccessor.getCanonicalUri(this._editorService.activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY })?.toString();
		const dirtySet = new Set(
			this._textFiles.files.models.filter(m => m.isDirty()).map(m => m.resource.toString()),
		);
		const buffers: IQuantumIDEOpenBufferInfo[] = [];
		let order = 0;
		for (const editor of this._editorService.editors) {
			const resource = EditorResourceAccessor.getCanonicalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY });
			const uri = resource?.toString() ?? `untitled:${editor.getName()}`;
			const model = resource ? this._modelService.getModel(resource) : undefined;
			const content = model?.getValue() ?? '';
			const isUntitled = resource?.scheme === Schemas.untitled;
			buffers.push({
				uri,
				label: resource ? basename(resource.fsPath) : editor.getName(),
				order: order++,
				isActive: activeUri === uri,
				isDirty: dirtySet.has(uri) || (resource ? this._textFiles.isDirty(resource) : false),
				isUntitled: !!isUntitled,
				languageId: model?.getLanguageId(),
				lineCount: model?.getLineCount() ?? 0,
				contentPreview: content.slice(0, maxPreviewChars),
			});
		}
		for (const model of this._modelService.getModels()) {
			const uri = model.uri.toString();
			if (buffers.some(b => b.uri === uri)) {
				continue;
			}
			buffers.push({
				uri,
				label: basename(model.uri.fsPath) || uri,
				order: order++,
				isActive: activeUri === uri,
				isDirty: dirtySet.has(uri),
				isUntitled: model.uri.scheme === Schemas.untitled,
				languageId: model.getLanguageId(),
				lineCount: model.getLineCount(),
				contentPreview: model.getValue().slice(0, maxPreviewChars),
			});
		}
		const summary = buffers.map(b =>
			`${b.order + 1}. ${b.label}${b.isActive ? ' (active)' : ''}${b.isDirty ? ' [dirty]' : ''}${b.isUntitled ? ' [untitled]' : ''} — ${b.lineCount} lines`,
		).join('\n');
		return { updatedAt: Date.now(), activeUri, buffers, summary };
	}

	formatForContext(maxPreviewChars = DEFAULT_PREVIEW): string {
		const snap = this.getSnapshot(maxPreviewChars);
		if (snap.buffers.length === 0) {
			return 'No open editor buffers.';
		}
		const lines = ['Open buffers:', snap.summary];
		for (const b of snap.buffers) {
			if (b.isDirty || b.isActive) {
				lines.push(`\n--- ${b.label} (${b.uri}) ---\n${b.contentPreview}`);
			}
		}
		return lines.join('\n');
	}
}

registerSingleton(IQuantumIDEOpenBuffersService, QuantumIDEOpenBuffersService, InstantiationType.Delayed);
