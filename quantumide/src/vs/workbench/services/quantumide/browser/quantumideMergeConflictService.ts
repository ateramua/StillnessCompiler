/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IQuantumIDEDiffReviewService } from './quantumideDiffReviewService.js';

export type QuantumIDEMergeAction = 'open_merge_editor' | 'accept_current' | 'accept_incoming' | 'next_conflict';

export interface IQuantumIDEMergeConflictResult {
	readonly success: boolean;
	readonly message: string;
	readonly conflictCount?: number;
}

export interface IQuantumIDEMergeConflictService {
	readonly _serviceBrand: undefined;
	hasConflictMarkers(uri: URI, text?: string): boolean;
	countConflictMarkers(text: string): number;
	resolveConflictAction(action: QuantumIDEMergeAction, uri?: URI): Promise<IQuantumIDEMergeConflictResult>;
	openVisualDiffForPath(path: string, proposedContent: string, workspaceRoot: URI | undefined): Promise<void>;
}

export const IQuantumIDEMergeConflictService = createDecorator<IQuantumIDEMergeConflictService>('quantumIDEMergeConflictService');

const CONFLICT_START = /^<<<<<<< /m;

export class QuantumIDEMergeConflictService implements IQuantumIDEMergeConflictService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@ICodeEditorService private readonly _codeEditorService: ICodeEditorService,
		@ICommandService private readonly _commandService: ICommandService,
		@IFileService private readonly _fileService: IFileService,
		@IQuantumIDEDiffReviewService private readonly _diffReviewService: IQuantumIDEDiffReviewService,
	) { }

	hasConflictMarkers(uri: URI, text?: string): boolean {
		if (text !== undefined) {
			return CONFLICT_START.test(text);
		}
		const model = this._codeEditorService.getActiveCodeEditor()?.getModel();
		if (model && model.uri.toString() === uri.toString()) {
			return CONFLICT_START.test(model.getValue());
		}
		return false;
	}

	countConflictMarkers(text: string): number {
		return (text.match(/^<<<<<<< /gm) ?? []).length;
	}

	async resolveConflictAction(action: QuantumIDEMergeAction, uri?: URI): Promise<IQuantumIDEMergeConflictResult> {
		const target = uri ?? this._codeEditorService.getActiveCodeEditor()?.getModel()?.uri;
		if (!target) {
			return { success: false, message: 'No file specified for merge action.' };
		}
		let text = '';
		try {
			text = (await this._fileService.readFile(target)).value.toString();
		} catch {
			return { success: false, message: `Could not read ${target.fsPath}` };
		}
		const conflictCount = this.countConflictMarkers(text);
		if (conflictCount === 0 && action !== 'open_merge_editor') {
			return { success: false, message: 'No merge conflict markers found in the file.', conflictCount: 0 };
		}

		switch (action) {
			case 'open_merge_editor':
				await this._commandService.executeCommand('merge.goToNextUnhandledConflict');
				return { success: true, message: `Opened merge navigation (${conflictCount} conflict block(s)).`, conflictCount };
			case 'accept_current':
				await this._commandService.executeCommand('merge.acceptAllInput1');
				return { success: true, message: 'Accepted current (input 1) for all conflicts.', conflictCount };
			case 'accept_incoming':
				await this._commandService.executeCommand('merge.acceptAllInput2');
				return { success: true, message: 'Accepted incoming (input 2) for all conflicts.', conflictCount };
			case 'next_conflict':
				await this._commandService.executeCommand('merge.goToNextUnhandledConflict');
				return { success: true, message: 'Moved to next unhandled conflict.', conflictCount };
			default:
				return { success: false, message: `Unknown merge action: ${action}` };
		}
	}

	async openVisualDiffForPath(path: string, proposedContent: string, workspaceRoot: URI | undefined): Promise<void> {
		await this._diffReviewService.openProposedFileEdits('QuantumIDE diff review', [{ path, content: proposedContent }], workspaceRoot);
	}
}

registerSingleton(IQuantumIDEMergeConflictService, QuantumIDEMergeConflictService, InstantiationType.Delayed);
