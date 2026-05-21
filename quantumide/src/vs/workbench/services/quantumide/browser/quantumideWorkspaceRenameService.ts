/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { ResourceMap, ResourceSet } from '../../../../base/common/map.js';
import { Position } from '../../../../editor/common/core/position.js';
import { TextEdit } from '../../../../editor/common/languages.js';
import { TextEdit as TextEditOperation, TextReplacement } from '../../../../editor/common/core/edits/textEdit.js';
import { Range } from '../../../../editor/common/core/range.js';
import { relativePath } from '../../../../base/common/resources.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { rename } from '../../../../editor/contrib/rename/browser/rename.js';
import { ResourceTextEdit, IBulkEditService } from '../../../../editor/browser/services/bulkEditService.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { findLineNumber, findSymbolColumn, resolveToolUri, type ISymbolToolInput } from '../../../contrib/chat/browser/tools/toolHelpers.js';
import { IQuantumIDEChatEditSessionService } from './quantumideChatEditSessionService.js';
import { IQuantumIDEDiffReviewService } from './quantumideDiffReviewService.js';
import { IQuantumIDEWorkspaceSnapshotService } from '../common/quantumideWorkspaceSnapshot.js';

export interface IQuantumIDEWorkspaceRenameInput extends ISymbolToolInput {
	readonly newName: string;
	readonly previewOnly?: boolean;
}

export interface IQuantumIDEWorkspaceRenameResult {
	readonly success: boolean;
	readonly message: string;
	readonly fileCount?: number;
	readonly editCount?: number;
	readonly checkpointId?: string;
}

export interface IQuantumIDEWorkspaceRenameService {
	readonly _serviceBrand: undefined;
	renameSymbol(input: IQuantumIDEWorkspaceRenameInput, workingDirectory?: import('../../../../base/common/uri.js').URI): Promise<IQuantumIDEWorkspaceRenameResult>;
}

export const IQuantumIDEWorkspaceRenameService = createDecorator<IQuantumIDEWorkspaceRenameService>('quantumIDEWorkspaceRenameService');

export class QuantumIDEWorkspaceRenameService implements IQuantumIDEWorkspaceRenameService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@ILanguageFeaturesService private readonly _languageFeatures: ILanguageFeaturesService,
		@ITextModelService private readonly _textModelService: ITextModelService,
		@IWorkspaceContextService private readonly _workspace: IWorkspaceContextService,
		@IBulkEditService private readonly _bulkEdit: IBulkEditService,
		@IQuantumIDEChatEditSessionService private readonly _chatEdits: IQuantumIDEChatEditSessionService,
		@IQuantumIDEDiffReviewService private readonly _diffReview: IQuantumIDEDiffReviewService,
		@IQuantumIDEWorkspaceSnapshotService private readonly _snapshots: IQuantumIDEWorkspaceSnapshotService,
	) { }

	async renameSymbol(input: IQuantumIDEWorkspaceRenameInput, workingDirectory?: import('../../../../base/common/uri.js').URI): Promise<IQuantumIDEWorkspaceRenameResult> {
		const uri = resolveToolUri(input, this._workspace, workingDirectory);
		if (!uri) {
			return { success: false, message: 'Provide uri or filePath for the symbol location.' };
		}
		const checkpoint = await this._snapshots.createSnapshot(
			localize('quantumide.rename.checkpoint', 'Before rename {0} → {1}', input.symbol, input.newName),
		).catch(() => undefined);

		const ref = await this._textModelService.createModelReference(uri);
		try {
			const model = ref.object.textEditorModel;
			if (!this._languageFeatures.renameProvider.has(model)) {
				return { success: false, message: 'No LSP rename provider for this language.' };
			}
			const lineNumber = findLineNumber(model, input.lineContent);
			if (lineNumber === undefined) {
				return { success: false, message: `Line content not found in ${uri.fsPath}.` };
			}
			const lineText = model.getLineContent(lineNumber);
			const column = findSymbolColumn(lineText, input.symbol);
			if (column === undefined) {
				return { success: false, message: `Symbol "${input.symbol}" not found on matched line.` };
			}
			const renameResult = await rename(
				this._languageFeatures.renameProvider,
				model,
				new Position(lineNumber, column),
				input.newName,
			);
			if (renameResult.rejectReason) {
				return { success: false, message: `Rename rejected: ${renameResult.rejectReason}` };
			}
			if (renameResult.edits.length === 0) {
				return { success: false, message: 'Rename produced no edits.' };
			}

			const previewOnly = input.previewOnly !== false;
			if (previewOnly) {
				const staged = await this._stageEdits(renameResult.edits);
				if (staged.length > 0) {
					const root = this._workspace.getWorkspace().folders[0]?.uri;
					await this._chatEdits.stageFromProposedEdits(staged, localize('quantumide.rename.stage', 'LSP rename'));
					await this._diffReview.openProposedFileEdits(
						localize('quantumide.rename.preview', 'Rename: {0} → {1}', input.symbol, input.newName),
						staged,
						root,
					);
					return {
						success: true,
						message: localize('quantumide.rename.previewMsg', 'Staged {0} file(s) for review. Accept/reject in chat or inline diff.', staged.length),
						fileCount: staged.length,
						editCount: renameResult.edits.length,
						checkpointId: checkpoint?.id,
					};
				}
			}

			await this._bulkEdit.apply(renameResult);
			const fileCount = new ResourceSet(renameResult.edits.filter(ResourceTextEdit.is).map(e => e.resource)).size;
			return {
				success: true,
				message: localize('quantumide.rename.applied', 'Renamed across {0} file(s). Undo via editor or restore checkpoint {1}.', fileCount, checkpoint?.id ?? 'n/a'),
				fileCount,
				editCount: renameResult.edits.length,
				checkpointId: checkpoint?.id,
			};
		} finally {
			ref.dispose();
		}
	}

	private async _stageEdits(edits: readonly unknown[]): Promise<{ path: string; content: string; resourceUri: string }[]> {
		const editsByUri = new ResourceMap<TextEdit[]>();
		for (const edit of edits) {
			if (!ResourceTextEdit.is(edit)) {
				continue;
			}
			let uriEdits = editsByUri.get(edit.resource);
			if (!uriEdits) {
				uriEdits = [];
				editsByUri.set(edit.resource, uriEdits);
			}
			uriEdits.push(edit.textEdit);
		}
		const staged: { path: string; content: string; resourceUri: string }[] = [];
		for (const [editUri, uriEdits] of editsByUri) {
			const folder = this._workspace.getWorkspaceFolder(editUri);
			const relPath = folder ? relativePath(folder.uri, editUri) : undefined;
			if (!relPath) {
				continue;
			}
			const ref = await this._textModelService.createModelReference(editUri);
			try {
				const model = ref.object.textEditorModel;
				const replacements = uriEdits.map(edit => new TextReplacement(Range.lift(edit.range), edit.text));
				const content = TextEditOperation.fromParallelReplacementsUnsorted(replacements).applyToString(model.getValue());
				staged.push({ path: relPath, content, resourceUri: editUri.toString() });
			} finally {
				ref.dispose();
			}
		}
		return staged;
	}
}

registerSingleton(IQuantumIDEWorkspaceRenameService, QuantumIDEWorkspaceRenameService, InstantiationType.Delayed);
