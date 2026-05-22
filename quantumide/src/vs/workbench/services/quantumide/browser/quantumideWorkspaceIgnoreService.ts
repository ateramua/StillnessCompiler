/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { QuantumIDEAISettingId } from '../../../../platform/quantumide/common/quantumideAISettings.js';
import {
	isQuantumIDEPathIgnored,
	QUANTUMIDE_IGNORE_FILE,
	type IQuantumIDEWorkspaceIgnorePolicy,
	type QuantumIDEIgnoreMode,
} from '../../../../platform/quantumide/common/quantumideWorkspaceIgnore.js';
import { mergeQuantumIDEIndexingExcludePatterns } from '../../../../platform/quantumide/common/quantumideIndexingExcludePatterns.js';
import { loadQuantumIDEWorkspaceIgnorePolicy } from '../../../../platform/quantumide/common/quantumideWorkspaceIgnoreLoader.js';
import { QuantumIDEWorkspaceIndexExcludeNames } from '../../../../platform/quantumide/common/quantumideWorkspaceGraph.js';
import { collectAgentSearchRoots, formatWorkspaceFolderLinks } from '../../../../platform/quantumide/common/quantumideWorkspaceRoots.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IQuantumIDEWorkspaceContextService } from '../common/quantumideWorkspaceContext.js';
import { IQuantumIDEWorkspaceIgnoreService } from '../common/quantumideWorkspaceIgnoreService.js';

export class QuantumIDEWorkspaceIgnoreService extends Disposable implements IQuantumIDEWorkspaceIgnoreService {
	declare readonly _serviceBrand: undefined;

	private _policy: IQuantumIDEWorkspaceIgnorePolicy | undefined;
	private _loadPromise: Promise<IQuantumIDEWorkspaceIgnorePolicy> | undefined;

	constructor(
		@IFileService private readonly _files: IFileService,
		@IWorkspaceContextService private readonly _workspace: IWorkspaceContextService,
		@IConfigurationService private readonly _config: IConfigurationService,
		@IQuantumIDEWorkspaceContextService private readonly _workspaceContext: IQuantumIDEWorkspaceContextService,
	) {
		super();
		this._register(this._files.onDidFilesChange(() => this.invalidate()));
		this._register(this._workspaceContext.onDidChangeGraph(() => this.invalidate()));
		this._register(this._config.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(QuantumIDEAISettingId.IndexingExcludePatterns)
				|| e.affectsConfiguration(QuantumIDEAISettingId.IndexingIgnoreFile)
				|| e.affectsConfiguration(QuantumIDEAISettingId.IndexingSecretFileNames)) {
				this.invalidate();
			}
		}));
		// AC-01-03: warm ignore policy before first @ mention on cold open.
		void this.getPolicy();
	}

	async getPolicy(): Promise<IQuantumIDEWorkspaceIgnorePolicy> {
		if (this._policy) {
			return this._policy;
		}
		if (this._loadPromise) {
			return this._loadPromise;
		}
		this._loadPromise = this._load().finally(() => {
			this._loadPromise = undefined;
		});
		this._policy = await this._loadPromise;
		this._workspaceContext.rebuildCachedAtMentionPaths(this._policy);
		return this._policy;
	}

	async isPathIgnored(relativePath: string, mode: QuantumIDEIgnoreMode = 'ai', fileName?: string): Promise<boolean> {
		const policy = await this.getPolicy();
		return isQuantumIDEPathIgnored(relativePath, policy, mode, fileName);
	}

	invalidate(): void {
		this._policy = undefined;
	}

	private async _load(): Promise<IQuantumIDEWorkspaceIgnorePolicy> {
		const folders = this._workspace.getWorkspace().folders;
		const roots = collectAgentSearchRoots(
			folders[0]?.uri,
			formatWorkspaceFolderLinks(folders.map(f => ({ name: f.name, uri: f.uri }))),
		);
		const secrets = this._config.getValue<string[]>(QuantumIDEAISettingId.IndexingSecretFileNames) ?? [];
		const configured = this._config.getValue<string[]>(QuantumIDEAISettingId.IndexingExcludePatterns) ?? [];
		const unifiedIgnore = this._config.getValue<string>(QuantumIDEAISettingId.IndexingIgnoreFile) ?? QUANTUMIDE_IGNORE_FILE;
		const base = await loadQuantumIDEWorkspaceIgnorePolicy(
			this._files,
			roots,
			new Set(QuantumIDEWorkspaceIndexExcludeNames),
			secrets,
			{ unifiedIgnoreFile: unifiedIgnore },
		);
		return mergeQuantumIDEIndexingExcludePatterns(base, configured);
	}
}

registerSingleton(IQuantumIDEWorkspaceIgnoreService, QuantumIDEWorkspaceIgnoreService, InstantiationType.Delayed);
