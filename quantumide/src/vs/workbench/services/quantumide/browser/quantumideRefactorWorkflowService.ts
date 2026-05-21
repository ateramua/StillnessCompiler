/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import {
	IQuantumIDERefactorAction,
	IQuantumIDERefactorWorkflowService,
	QUANTUMIDE_REFACTOR_HISTORY_KEY,
} from '../common/quantumideRefactorWorkflow.js';

const REFACTORS: readonly IQuantumIDERefactorAction[] = [
	{ id: 'rename', label: localize('quantumide.refactor.rename', 'Rename Symbol'), description: localize('quantumide.refactor.rename.desc', 'Workspace-wide LSP rename with preview'), command: 'quantumide.chat.lsp.renameSymbol', previewCommand: 'quantumide.chat.lsp.renameSymbol', requiresSelection: true },
	{ id: 'refactor', label: localize('quantumide.refactor.menu', 'Refactor…'), description: localize('quantumide.refactor.menu.desc', 'Show all LSP refactorings'), command: 'quantumide.chat.lsp.refactor', requiresSelection: true },
	{ id: 'extract', label: localize('quantumide.refactor.extract', 'Extract Method'), description: localize('quantumide.refactor.extract.desc', 'Extract selection to a new method'), command: 'editor.action.refactor', requiresSelection: true },
	{ id: 'extractInterface', label: localize('quantumide.refactor.extractInterface', 'Extract Interface'), description: localize('quantumide.refactor.extractInterface.desc', 'Extract type to interface'), command: 'editor.action.refactor', requiresSelection: true },
	{ id: 'move', label: localize('quantumide.refactor.move', 'Move Symbol'), description: localize('quantumide.refactor.move.desc', 'Move symbol to another file'), command: 'editor.action.refactor', requiresSelection: true },
	{ id: 'inline', label: localize('quantumide.refactor.inline', 'Inline Variable'), description: localize('quantumide.refactor.inline.desc', 'Inline variable or function'), command: 'editor.action.refactor', requiresSelection: true },
	{ id: 'preview', label: localize('quantumide.refactor.preview', 'Preview Staged Refactor'), description: localize('quantumide.refactor.preview.desc', 'Open multi-file diff for staged chat edits'), command: 'quantumide.chat.reviewPendingEdits' },
	{ id: 'quickFix', label: localize('quantumide.refactor.quickFix', 'Quick Fix'), description: localize('quantumide.refactor.quickFix.desc', 'Apply diagnostic quick fix'), command: 'quantumide.chat.lsp.quickFix' },
];

export class QuantumIDERefactorWorkflowService extends Disposable implements IQuantumIDERefactorWorkflowService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	constructor(
		@IStorageService private readonly _storage: IStorageService,
	) {
		super();
	}

	getAvailableRefactors(hasSelection: boolean, hasActiveEditor: boolean): readonly IQuantumIDERefactorAction[] {
		return REFACTORS.filter(r => {
			if (r.requiresSelection && !hasSelection) {
				return false;
			}
			if (r.id !== 'preview' && !hasActiveEditor) {
				return false;
			}
			return true;
		});
	}

	getRefactorHistory(): readonly { id: string; label: string; at: number }[] {
		try {
			const raw = this._storage.get(QUANTUMIDE_REFACTOR_HISTORY_KEY, StorageScope.WORKSPACE);
			if (!raw) {
				return [];
			}
			return JSON.parse(raw) as { id: string; label: string; at: number }[];
		} catch {
			return [];
		}
	}

	recordRefactorRun(id: string, label: string): void {
		const history = [{ id, label, at: Date.now() }, ...this.getRefactorHistory()].slice(0, 20);
		this._storage.store(QUANTUMIDE_REFACTOR_HISTORY_KEY, JSON.stringify(history), StorageScope.WORKSPACE, StorageTarget.USER);
		this._onDidChange.fire();
	}
}

registerSingleton(IQuantumIDERefactorWorkflowService, QuantumIDERefactorWorkflowService, InstantiationType.Delayed);
