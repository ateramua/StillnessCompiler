/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { basename } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService, WorkbenchState } from '../../../../platform/workspace/common/workspace.js';
import { IWorkspaceEditingService } from '../../workspaces/common/workspaceEditing.js';
import {
	IQuantumIDEProjectEntry,
	IQuantumIDEProjectManagerService,
	QUANTUMIDE_RECENT_PROJECTS_KEY,
} from '../common/quantumideProjectManager.js';

interface IRecentProjectStored {
	readonly uri: string;
	readonly name: string;
	readonly openedAt: number;
}

export class QuantumIDEProjectManagerService extends Disposable implements IQuantumIDEProjectManagerService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private _busy = false;

	constructor(
		@IWorkspaceContextService private readonly _workspace: IWorkspaceContextService,
		@IWorkspaceEditingService private readonly _workspaceEditing: IWorkspaceEditingService,
		@IFileDialogService private readonly _fileDialog: IFileDialogService,
		@IStorageService private readonly _storage: IStorageService,
	) {
		super();
		this._register(this._workspace.onDidChangeWorkspaceFolders(() => this._fireChange()));
		this._register(this._workspace.onDidChangeWorkbenchState(() => this._fireChange()));
	}

	isBusy(): boolean {
		return this._busy;
	}

	getProjects(): readonly IQuantumIDEProjectEntry[] {
		const folders = this._workspace.getWorkspace().folders;
		const active = this._workspace.getWorkspace().folders[0]?.uri.toString();
		return folders.map((f, index) => ({
			uri: f.uri,
			name: f.name || basename(f.uri.fsPath) || f.uri.fsPath,
			index,
			isActive: f.uri.toString() === active,
			error: undefined,
		}));
	}

	getRecentProjects(): readonly { uri: string; name: string; openedAt: number }[] {
		return this._readRecent().sort((a, b) => b.openedAt - a.openedAt).slice(0, 12);
	}

	recordRecent(uri: URI, name: string): void {
		const list = this._readRecent().filter(r => r.uri !== uri.toString());
		list.unshift({ uri: uri.toString(), name, openedAt: Date.now() });
		this._storage.store(QUANTUMIDE_RECENT_PROJECTS_KEY, JSON.stringify(list.slice(0, 24)), StorageScope.APPLICATION, StorageTarget.USER);
	}

	async addFolderFromPicker(): Promise<{ ok: boolean; error?: string }> {
		return this._run(async () => {
			const picks = await this._fileDialog.showOpenDialog({
				canSelectFiles: false,
				canSelectFolders: true,
				canSelectMany: true,
				title: localize('quantumide.project.addFolder', 'Add Workspace Folder'),
			});
			if (!picks?.length) {
				return { ok: false };
			}
			await this._workspaceEditing.addFolders(picks.map(uri => ({ uri })));
			for (const uri of picks) {
				this.recordRecent(uri, basename(uri.fsPath) || uri.fsPath);
			}
			return { ok: true };
		});
	}

	async removeFolder(uri: URI): Promise<{ ok: boolean; error?: string }> {
		return this._run(async () => {
			if (this._workspace.getWorkbenchState() === WorkbenchState.EMPTY) {
				return { ok: false, error: localize('quantumide.project.noWorkspace', 'No workspace is open.') };
			}
			await this._workspaceEditing.removeFolders([uri]);
			return { ok: true };
		});
	}

	async openFolder(): Promise<{ ok: boolean; error?: string }> {
		return this._run(async () => {
			const picks = await this._fileDialog.showOpenDialog({
				canSelectFiles: false,
				canSelectFolders: true,
				canSelectMany: false,
				title: localize('quantumide.project.openFolder', 'Open Folder'),
			});
			const uri = picks?.[0];
			if (!uri) {
				return { ok: false };
			}
			await this._workspaceEditing.createAndEnterWorkspace([{ uri }]);
			this.recordRecent(uri, basename(uri.fsPath) || uri.fsPath);
			return { ok: true };
		});
	}

	async switchToFolder(uri: URI): Promise<{ ok: boolean; error?: string }> {
		return this._run(async () => {
			const folders = this._workspace.getWorkspace().folders;
			const target = folders.find(f => f.uri.toString() === uri.toString());
			if (!target) {
				return { ok: false, error: localize('quantumide.project.notInWorkspace', 'Folder is not in the current workspace.') };
			}
			this.recordRecent(uri, target.name);
			return { ok: true };
		});
	}

	private async _run(fn: () => Promise<{ ok: boolean; error?: string }>): Promise<{ ok: boolean; error?: string }> {
		this._busy = true;
		this._fireChange();
		try {
			return await fn();
		} catch (err) {
			return { ok: false, error: String(err) };
		} finally {
			this._busy = false;
			this._fireChange();
		}
	}

	private _fireChange(): void {
		this._onDidChange.fire();
	}

	private _readRecent(): IRecentProjectStored[] {
		try {
			const raw = this._storage.get(QUANTUMIDE_RECENT_PROJECTS_KEY, StorageScope.APPLICATION);
			if (!raw) {
				return [];
			}
			const parsed = JSON.parse(raw) as IRecentProjectStored[];
			return Array.isArray(parsed) ? parsed : [];
		} catch {
			return [];
		}
	}
}

registerSingleton(IQuantumIDEProjectManagerService, QuantumIDEProjectManagerService, InstantiationType.Delayed);
