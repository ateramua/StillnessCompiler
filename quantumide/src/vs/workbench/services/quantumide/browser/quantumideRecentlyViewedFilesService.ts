/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IEditorService } from '../../editor/common/editorService.js';
import { collectAgentSearchRoots, formatWorkspaceFolderLinks, relativePathInWorkspaceRoots } from '../../../../platform/quantumide/common/quantumideWorkspaceRoots.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import {
	IQuantumIDERecentlyViewedEntry,
	IQuantumIDERecentlyViewedFilesService,
} from '../common/quantumideRecentlyViewedFiles.js';

const MAX_RECENT = 24;

export class QuantumIDERecentlyViewedFilesService extends Disposable implements IQuantumIDERecentlyViewedFilesService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private readonly _entries: IQuantumIDERecentlyViewedEntry[] = [];

	constructor(
		@IEditorService private readonly _editorService: IEditorService,
		@IWorkspaceContextService private readonly _workspace: IWorkspaceContextService,
	) {
		super();
		this._register(this._editorService.onDidActiveEditorChange(() => {
			const resource = this._editorService.activeEditor?.resource;
			if (resource && resource.scheme !== 'output') {
				const roots = collectAgentSearchRoots(
					this._workspace.getWorkspace().folders[0]?.uri,
					formatWorkspaceFolderLinks(this._workspace.getWorkspace().folders.map(f => ({ name: f.name, uri: f.uri }))),
				);
				const rel = relativePathInWorkspaceRoots(resource, roots);
				this.recordView(resource, rel);
			}
		}));
	}

	recordView(uri: URI, workspaceRelativePath?: string): void {
		const key = uri.toString();
		const next = this._entries.filter(e => e.uri !== key);
		next.unshift({
			uri: key,
			workspaceRelativePath,
			viewedAt: Date.now(),
		});
		this._entries.length = 0;
		this._entries.push(...next.slice(0, MAX_RECENT));
		this._onDidChange.fire();
	}

	getRecent(maxEntries = 12): readonly IQuantumIDERecentlyViewedEntry[] {
		return this._entries.slice(0, maxEntries);
	}
}

registerSingleton(IQuantumIDERecentlyViewedFilesService, QuantumIDERecentlyViewedFilesService, InstantiationType.Delayed);
