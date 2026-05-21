/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { decodeQuantumIDEFileBuffer, encodeQuantumIDEFileText } from '../../../../platform/quantumide/common/quantumideFileEncoding.js';

export const QUANTUMIDE_DIFF_PREVIEW_DIR = '.quantumide/diff-preview';

export interface IQuantumIDEDiffReviewResource {
	readonly originalUri: URI;
	readonly modifiedUri: URI;
	readonly label?: string;
}

export interface IQuantumIDEProposedFileEdit {
	readonly path: string;
	readonly content: string;
}

export interface IQuantumIDEDiffReviewService {
	readonly _serviceBrand: undefined;
	openMultiDiffReview(title: string, resources: readonly IQuantumIDEDiffReviewResource[]): Promise<void>;
	openProposedFileEdits(title: string, edits: readonly IQuantumIDEProposedFileEdit[], workspaceRoot: URI | undefined): Promise<void>;
}

export const IQuantumIDEDiffReviewService = createDecorator<IQuantumIDEDiffReviewService>('quantumIDEDiffReviewService');

export class QuantumIDEDiffReviewService implements IQuantumIDEDiffReviewService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IFileService private readonly _fileService: IFileService,
		@ICommandService private readonly _commandService: ICommandService,
	) { }

	async openMultiDiffReview(title: string, resources: readonly IQuantumIDEDiffReviewResource[]): Promise<void> {
		if (resources.length === 0) {
			return;
		}
		await this._commandService.executeCommand('_workbench.openMultiDiffEditor', {
			title,
			resources: resources.map(resource => ({
				originalUri: resource.originalUri,
				modifiedUri: resource.modifiedUri,
			})),
			reveal: resources[0] ? { modifiedUri: resources[0].modifiedUri } : undefined,
		});
	}

	async openProposedFileEdits(title: string, edits: readonly IQuantumIDEProposedFileEdit[], workspaceRoot: URI | undefined): Promise<void> {
		if (!workspaceRoot || edits.length === 0) {
			return;
		}
		const previewRoot = joinPath(workspaceRoot, QUANTUMIDE_DIFF_PREVIEW_DIR);
		await this._fileService.createFolder(previewRoot);
		const resources: IQuantumIDEDiffReviewResource[] = [];
		for (const edit of edits) {
			const target = joinPath(workspaceRoot, edit.path);
			const id = generateUuid();
			const originalUri = joinPath(previewRoot, `${id}.original`);
			const modifiedUri = joinPath(previewRoot, `${id}.modified`);
			let originalText = '';
			let encoding: ReturnType<typeof decodeQuantumIDEFileBuffer>['encoding'] = 'utf8';
			try {
				const buffer = await this._fileService.readFile(target);
				const decoded = decodeQuantumIDEFileBuffer(buffer.value);
				originalText = decoded.text;
				encoding = decoded.encoding;
			} catch {
				// new file
			}
			await this._fileService.writeFile(originalUri, encodeQuantumIDEFileText(originalText, encoding));
			await this._fileService.writeFile(modifiedUri, encodeQuantumIDEFileText(edit.content, encoding));
			resources.push({ originalUri, modifiedUri, label: edit.path });
		}
		await this.openMultiDiffReview(title, resources);
	}
}

registerSingleton(IQuantumIDEDiffReviewService, QuantumIDEDiffReviewService, InstantiationType.Delayed);
