/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { isCodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { IModelDeltaDecoration, TrackedRangeStickiness } from '../../../../editor/common/model.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { QuantumIDEAISettingId } from '../../../../platform/quantumide/common/quantumideAISettings.js';
import { filterActiveCollabParticipants, isCollabPresenceStale } from '../../../../platform/quantumide/common/quantumideCollabPresenceUtils.js';
import { COLLAB_PRESENCE_STALE_MS, IQuantumIDECollaborationService } from '../common/quantumideCollaboration.js';
import { IEditorService } from '../../editor/common/editorService.js';

export interface IQuantumIDECollabCursorDecorationsService {
	readonly _serviceBrand: undefined;
}

export const IQuantumIDECollabCursorDecorationsService = createDecorator<IQuantumIDECollabCursorDecorationsService>('quantumIDECollabCursorDecorationsService');

const COLLAB_CURSOR_CLASS = 'quantumide-collab-remote-cursor';
const COLLAB_SELECTION_CLASS = 'quantumide-collab-remote-selection';

function participantColorIndex(id: string): number {
	let hash = 0;
	for (let i = 0; i < id.length; i++) {
		hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
	}
	return hash % 6;
}

export class QuantumIDECollabCursorDecorationsService extends Disposable implements IQuantumIDECollabCursorDecorationsService {
	declare readonly _serviceBrand: undefined;

	private readonly _decorationIdsByEditor = new Map<string, string[]>();

	constructor(
		@IQuantumIDECollaborationService private readonly _collab: IQuantumIDECollaborationService,
		@ICodeEditorService private readonly _codeEditorService: ICodeEditorService,
		@IEditorService private readonly _editorService: IEditorService,
		@IConfigurationService private readonly _config: IConfigurationService,
	) {
		super();
		if (this._config.getValue<boolean>(QuantumIDEAISettingId.ChatCollabEnabled) !== true) {
			return;
		}
		this._register(this._collab.onDidChangeSession(() => this._refreshAll()));
		this._register(this._editorService.onDidActiveEditorChange(() => this._refreshAll()));
		this._register(this._codeEditorService.onCodeEditorAdd(ed => {
			this._register(ed.onDidChangeModel(() => this._refreshEditor(ed)));
			this._register(ed.onDidChangeCursorPosition(() => this._refreshEditor(ed)));
		}));
		const interval = setInterval(() => this._refreshAll(), 2000);
		this._register({ dispose: () => clearInterval(interval) });
	}

	private _refreshAll(): void {
		for (const ed of this._codeEditorService.listCodeEditors()) {
			if (isCodeEditor(ed)) {
				this._refreshEditor(ed);
			}
		}
	}

	private _refreshEditor(editor: import('../../../../editor/browser/editorBrowser.js').ICodeEditor): void {
		const model = editor.getModel();
		const key = editor.getId();
		const prev = this._decorationIdsByEditor.get(key) ?? [];
		if (prev.length > 0) {
			editor.deltaDecorations(prev, []);
			this._decorationIdsByEditor.set(key, []);
		}
		if (!model) {
			return;
		}
		const session = this._collab.getActiveSession();
		if (!session) {
			return;
		}
		const resource = model.uri.toString();
		const now = Date.now();
		const self = this._collab.getParticipantId();
		const active = filterActiveCollabParticipants(
			session.participants.map(p => ({ ...p, id: p.id })),
			self,
			now,
			COLLAB_PRESENCE_STALE_MS,
			resource,
		);
		const decorations: IModelDeltaDecoration[] = [];
		for (const p of active) {
			const line = p.presence?.line;
			if (!line || line < 1 || line > model.getLineCount()) {
				continue;
			}
			const col = Math.min(Math.max(1, p.presence?.column ?? 1), model.getLineMaxColumn(line));
			const colorIdx = participantColorIndex(p.id);
			const lineRange = { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: model.getLineMaxColumn(line) };
			decorations.push({
				range: lineRange,
				options: {
					description: `collab-cursor-${p.id}`,
					className: `${COLLAB_CURSOR_CLASS} quantumide-collab-color-${colorIdx}`,
					hoverMessage: { value: `${p.displayName} (line ${line})` },
					isWholeLine: true,
				},
			});
			decorations.push({
				range: { startLineNumber: line, startColumn: col, endLineNumber: line, endColumn: col },
				options: {
					description: `collab-caret-${p.id}`,
					className: `${COLLAB_SELECTION_CLASS} quantumide-collab-color-${colorIdx}`,
					stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
				},
			});
		}
		if (decorations.length > 0) {
			const ids = editor.deltaDecorations([], decorations);
			this._decorationIdsByEditor.set(key, ids);
		}
	}

	/** @internal for tests */
	static isStale(lastSeen: number, now: number): boolean {
		return isCollabPresenceStale(lastSeen, now, COLLAB_PRESENCE_STALE_MS);
	}
}

registerSingleton(IQuantumIDECollabCursorDecorationsService, QuantumIDECollabCursorDecorationsService, InstantiationType.Delayed);
