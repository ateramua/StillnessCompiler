/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { Range } from '../../../../editor/common/core/range.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { QuantumIDEAISettingId } from '../../../../platform/quantumide/common/quantumideAISettings.js';
import { ITextFileService } from '../../textfile/common/textfiles.js';
import { IQuantumIDECollaborationService } from '../common/quantumideCollaboration.js';

export interface IQuantumIDECollabBufferPatch {
	readonly type: 'buffer_patch';
	readonly resource: string;
	readonly startLine: number;
	readonly endLine: number;
	readonly text: string;
	readonly authorId: string;
	readonly timestamp: number;
}

export interface IQuantumIDECollabLiveEditService {
	readonly _serviceBrand: undefined;
}

export const IQuantumIDECollabLiveEditService = createDecorator<IQuantumIDECollabLiveEditService>('quantumIDECollabLiveEditService');

const PATCH_PREFIX = '{"type":"buffer_patch"';

export class QuantumIDECollabLiveEditService extends Disposable implements IQuantumIDECollabLiveEditService {
	declare readonly _serviceBrand: undefined;

	private readonly _publish = this._register(new RunOnceScheduler(() => void this._flushPending(), 400));
	private _pending: IQuantumIDECollabBufferPatch | undefined;

	constructor(
		@IQuantumIDECollaborationService private readonly _collab: IQuantumIDECollaborationService,
		@ICodeEditorService private readonly _codeEditorService: ICodeEditorService,
		@ITextFileService private readonly _textFiles: ITextFileService,
		@IConfigurationService private readonly _config: IConfigurationService,
	) {
		super();
		if (this._config.getValue<boolean>(QuantumIDEAISettingId.ChatCollabEnabled) !== true) {
			return;
		}
		this._register(this._collab.onDidChangeSession(() => void this._applyRemotePatches()));
		this._register(this._codeEditorService.onCodeEditorAdd(ed => {
			const model = ed.getModel();
			if (!model) {
				return;
			}
			this._register(model.onDidChangeContent(() => {
				if (!this._collab.getActiveSession()) {
					return;
				}
				const sel = ed.getSelection();
				if (!sel) {
					return;
				}
				const line = sel.positionLineNumber;
				const lineText = model.getLineContent(line);
				this._pending = {
					type: 'buffer_patch',
					resource: model.uri.toString(),
					startLine: line,
					endLine: line,
					text: lineText,
					authorId: this._collab.getParticipantId(),
					timestamp: Date.now(),
				};
				this._publish.schedule();
			}));
		}));
	}

	private async _flushPending(): Promise<void> {
		const patch = this._pending;
		this._pending = undefined;
		if (!patch || !this._collab.getActiveSession()) {
			return;
		}
		await this._collab.appendChatMessage(JSON.stringify(patch), 'collab-sync');
	}

	private async _applyRemotePatches(): Promise<void> {
		const session = this._collab.getActiveSession();
		if (!session) {
			return;
		}
		const self = this._collab.getParticipantId();
		for (const msg of session.messages.slice(-20)) {
			if (msg.authorId === self || !msg.text.startsWith(PATCH_PREFIX)) {
				continue;
			}
			try {
				const patch = JSON.parse(msg.text) as IQuantumIDECollabBufferPatch;
				if (patch.type !== 'buffer_patch') {
					continue;
				}
				const uri = URI.parse(patch.resource);
				if (this._textFiles.isDirty(uri)) {
					continue;
				}
				const editor = this._codeEditorService.listCodeEditors().find(e => e.getModel()?.uri.toString() === uri.toString());
				const model = editor?.getModel();
				if (!model || !editor) {
					continue;
				}
				const range = new Range(patch.startLine, 1, patch.endLine, model.getLineMaxColumn(patch.endLine));
				model.pushStackElement();
				editor.executeEdits('quantumideCollabLive', [{ range, text: patch.text.endsWith('\n') ? patch.text : patch.text + '\n', forceMoveMarkers: true }]);
				model.pushStackElement();
			} catch {
				// ignore malformed
			}
		}
	}
}

registerSingleton(IQuantumIDECollabLiveEditService, QuantumIDECollabLiveEditService, InstantiationType.Delayed);
