/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../base/common/async.js';
import { Disposable } from '../../base/common/lifecycle.js';
import { joinPath } from '../../base/common/resources.js';
import { VSBuffer } from '../../base/common/buffer.js';
import { isQuantumIDEBuild } from '../../platform/quantumide/common/quantumideChatPlatform.js';
import { QUANTUMIDE_WORKSPACE_LINKS_FILE } from '../../platform/quantumide/common/agentVelocity.js';
import { formatWorkspaceFolderLinks, workspaceLinksToJson } from '../../platform/quantumide/common/quantumideWorkspaceRoots.js';
import product from '../../platform/product/common/product.js';
import { IFileService } from '../../platform/files/common/files.js';
import { IWorkspaceContextService, WorkbenchState } from '../../platform/workspace/common/workspace.js';
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from '../common/contributions.js';

/**
 * Keeps `.quantumide/workspace-links.json` in sync with VS Code workspace folders so the
 * agent host (separate process) can search/read across every root the UI shows — not only folders[0].
 */
class QuantumIDEWorkspaceRootsSyncContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.quantumideWorkspaceRootsSync';

	private readonly _sync = this._register(new RunOnceScheduler(() => void this._writeLinks(), 500));

	constructor(
		@IWorkspaceContextService private readonly _workspace: IWorkspaceContextService,
		@IFileService private readonly _files: IFileService,
	) {
		super();
		if (!isQuantumIDEBuild(product)) {
			return;
		}
		this._register(this._workspace.onDidChangeWorkspaceFolders(() => this._sync.schedule()));
		this._register(this._workspace.onDidChangeWorkbenchState(() => this._sync.schedule()));
		this._sync.schedule();
	}

	private async _writeLinks(): Promise<void> {
		if (this._workspace.getWorkbenchState() === WorkbenchState.EMPTY) {
			return;
		}
		const folders = this._workspace.getWorkspace().folders;
		const primary = folders[0]?.uri;
		if (!primary) {
			return;
		}
		const links = formatWorkspaceFolderLinks(folders.map(f => ({ name: f.name, uri: f.uri })));
		const target = joinPath(primary, QUANTUMIDE_WORKSPACE_LINKS_FILE);
		try {
			await this._files.writeFile(target, VSBuffer.fromString(workspaceLinksToJson(links)));
		} catch {
			try {
				await this._files.createFile(target, VSBuffer.fromString(workspaceLinksToJson(links)));
			} catch {
				// ignore — workspace may be read-only
			}
		}
	}
}

if (isQuantumIDEBuild(product)) {
	registerWorkbenchContribution2(QuantumIDEWorkspaceRootsSyncContribution.ID, QuantumIDEWorkspaceRootsSyncContribution, WorkbenchPhase.BlockRestore);
}
