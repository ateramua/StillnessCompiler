/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { QuantumIDEAISettingId } from '../../../../platform/quantumide/common/quantumideAISettings.js';
import { IEditorService } from '../../editor/common/editorService.js';
import { IQuantumIDEDiffReviewService } from './quantumideDiffReviewService.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';

export interface IQuantumIDEAgentUiParityService {
	readonly _serviceBrand: undefined;
	openSideBySideDiff(paths: readonly { path: string; content: string }[]): Promise<void>;
	splitEditorRight(): Promise<void>;
	splitEditorDown(): Promise<void>;
	openMultiDiffReview(label: string, edits: readonly { path: string; content: string }[]): Promise<void>;
}

export const IQuantumIDEAgentUiParityService = createDecorator<IQuantumIDEAgentUiParityService>('quantumIDEAgentUiParityService');

export class QuantumIDEAgentUiParityService implements IQuantumIDEAgentUiParityService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@ICommandService private readonly _commands: ICommandService,
		@IEditorService private readonly _editorService: IEditorService,
		@IQuantumIDEDiffReviewService private readonly _diffReview: IQuantumIDEDiffReviewService,
		@IWorkspaceContextService private readonly _workspace: IWorkspaceContextService,
		@IConfigurationService private readonly _configuration: IConfigurationService,
	) { }

	async openSideBySideDiff(paths: readonly { path: string; content: string }[]): Promise<void> {
		if (paths.length === 0) {
			return;
		}
		const root = this._workspace.getWorkspace().folders[0]?.uri;
		const first = paths[0];
		if (root && first) {
			const resource = URI.joinPath(root, first.path.replace(/^\.\//, ''));
			await this._editorService.openEditor({
				resource,
				options: { pinned: true },
			});
			if (this._configuration.getValue<boolean>(QuantumIDEAISettingId.ChatDiffSideBySide) !== false) {
				await this._commands.executeCommand('merge.compare');
			}
		}
		await this.openMultiDiffReview('Side-by-side review', paths);
	}

	async splitEditorRight(): Promise<void> {
		await this._commands.executeCommand('workbench.action.splitEditor');
	}

	async splitEditorDown(): Promise<void> {
		await this._commands.executeCommand('workbench.action.splitEditorOrthogonal');
	}

	async openMultiDiffReview(label: string, edits: readonly { path: string; content: string }[]): Promise<void> {
		await this._diffReview.openProposedFileEdits(label, edits, this._workspace.getWorkspace().folders[0]?.uri);
	}
}

registerSingleton(IQuantumIDEAgentUiParityService, QuantumIDEAgentUiParityService, InstantiationType.Delayed);
