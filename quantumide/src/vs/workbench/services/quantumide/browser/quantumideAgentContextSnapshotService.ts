/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { QuantumIDEAISettingId } from '../../../../platform/quantumide/common/quantumideAISettings.js';
import { writeQuantumIDEAgentContextSnapshot } from '../../../../platform/quantumide/common/quantumideAgentContextSnapshotStore.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { IEditorService } from '../../editor/common/editorService.js';
import { IQuantumIDEEditorStateService } from './quantumideEditorStateService.js';
import { IQuantumIDEOpenBuffersService } from '../common/quantumideOpenBuffers.js';

export interface IQuantumIDEAgentContextSnapshotService {
	readonly _serviceBrand: undefined;
	getLatestSummary(): string | undefined;
}

export const IQuantumIDEAgentContextSnapshotService = createDecorator<IQuantumIDEAgentContextSnapshotService>('quantumIDEAgentContextSnapshotService');

export class QuantumIDEAgentContextSnapshotService extends Disposable implements IQuantumIDEAgentContextSnapshotService {
	declare readonly _serviceBrand: undefined;

	private _latestSummary: string | undefined;
	private readonly _persist = this._register(new RunOnceScheduler(() => void this._write(), 500));

	constructor(
		@IQuantumIDEEditorStateService private readonly _editorState: IQuantumIDEEditorStateService,
		@IQuantumIDEOpenBuffersService private readonly _openBuffers: IQuantumIDEOpenBuffersService,
		@IEditorService private readonly _editorService: IEditorService,
		@ICodeEditorService private readonly _codeEditorService: ICodeEditorService,
		@IFileService private readonly _fileService: IFileService,
		@IWorkspaceContextService private readonly _workspace: IWorkspaceContextService,
		@IConfigurationService private readonly _configuration: IConfigurationService,
	) {
		super();
		if (this._configuration.getValue<boolean>(QuantumIDEAISettingId.AgentEditorContextSnapshot) === false) {
			return;
		}
		const schedule = () => this._persist.schedule();
		this._register(this._editorService.onDidActiveEditorChange(schedule));
		this._register(this._codeEditorService.onCodeEditorAdd(ed => {
			this._register(ed.onDidChangeCursorPosition(schedule));
			const model = ed.getModel();
			if (model) {
				this._register(model.onDidChangeContent(schedule));
			}
		}));
		schedule();
	}

	getLatestSummary(): string | undefined {
		return this._latestSummary;
	}

	private async _write(): Promise<void> {
		const snap = this._editorState.getEditorStateSnapshot();
		const editorPart = this._editorState.formatEditorStateForContext() ?? '';
		const buffersPart = this._openBuffers.formatForContext(1200);
		const summary = [editorPart, buffersPart].filter(Boolean).join('\n\n');
		this._latestSummary = summary;
		await writeQuantumIDEAgentContextSnapshot(this._fileService, this._workspace.getWorkspace().folders[0]?.uri, {
			updatedAt: Date.now(),
			activeResource: snap.activeResource,
			languageId: snap.languageId,
			cursor: snap.cursor ?? (snap.selection && !snap.selection.isEmpty ? {
				line: snap.selection.startLine,
				column: snap.selection.startColumn,
			} : undefined),
			selection: snap.selection ? {
				startLine: snap.selection.startLine,
				startColumn: snap.selection.startColumn,
				endLine: snap.selection.endLine,
				endColumn: snap.selection.endColumn,
				text: snap.selection.text,
			} : undefined,
			openTabs: snap.openTabs,
			summary,
		});
	}
}

registerSingleton(IQuantumIDEAgentContextSnapshotService, QuantumIDEAgentContextSnapshotService, InstantiationType.Delayed);
