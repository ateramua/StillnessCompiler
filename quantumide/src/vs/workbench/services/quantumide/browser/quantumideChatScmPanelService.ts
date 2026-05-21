/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ISCMService, ISCMRepository } from '../../../contrib/scm/common/scm.js';
import {
	IQuantumIDEChatScmFileEntry,
	IQuantumIDEChatScmPanelService,
	IQuantumIDEChatScmRepoState,
} from '../common/quantumideChatScmPanel.js';

function mapGroupId(groupId: string): IQuantumIDEChatScmFileEntry['status'] {
	if (groupId === 'index') {
		return 'staged';
	}
	if (groupId === 'merge') {
		return 'conflict';
	}
	if (groupId === 'untracked') {
		return 'untracked';
	}
	return 'unstaged';
}

export class QuantumIDEChatScmPanelService extends Disposable implements IQuantumIDEChatScmPanelService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private _repos: readonly IQuantumIDEChatScmRepoState[] = [];

	constructor(
		@ISCMService private readonly _scm: ISCMService,
	) {
		super();
		this._register(this._scm.onDidAddRepository(r => this._watchRepo(r)));
		for (const r of this._scm.repositories) {
			this._watchRepo(r);
		}
		this.refresh();
	}

	getRepositories(): readonly IQuantumIDEChatScmRepoState[] {
		return this._repos;
	}

	refresh(): void {
		this._repos = [...this._scm.repositories].map(r => this._buildRepoState(r));
		this._onDidChange.fire();
	}

	private _watchRepo(repo: ISCMRepository): void {
		this._register(autorun(reader => {
			repo.provider.historyProvider.read(reader)?.historyItemRef.read(reader);
			this.refresh();
		}));
		this._register(repo.provider.onDidChangeResources(() => this.refresh()));
	}

	private _buildRepoState(repo: ISCMRepository): IQuantumIDEChatScmRepoState {
		const history = repo.provider.historyProvider.get();
		const branch = history?.historyItemRef.get()?.name;
		const remoteBranch = history?.historyItemRemoteRef.get()?.name;
		const files: IQuantumIDEChatScmFileEntry[] = [];
		let hasConflicts = false;
		for (const group of repo.provider.groups) {
			const status = mapGroupId(group.id);
			if (status === 'conflict') {
				hasConflicts = true;
			}
			for (const resource of group.resources) {
				const uri = resource.sourceUri;
				if (!uri) {
					continue;
				}
				files.push({
					path: uri.fsPath,
					uri,
					status,
				});
			}
		}
		return {
			providerLabel: repo.provider.label,
			branch,
			remoteBranch,
			files,
			hasConflicts,
		};
	}
}

registerSingleton(IQuantumIDEChatScmPanelService, QuantumIDEChatScmPanelService, InstantiationType.Delayed);
