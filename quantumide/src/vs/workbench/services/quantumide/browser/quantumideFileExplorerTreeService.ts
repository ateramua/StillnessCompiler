/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { basename } from '../../../../base/common/path.js';
import { dirname, isEqualOrParent, joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IQuantumIDEErrorRecoveryService } from '../common/quantumideErrorRecovery.js';
import {
	IQuantumIDEFileExplorerMoveResult,
	IQuantumIDEFileExplorerTreeNode,
	IQuantumIDEFileExplorerTreeService,
	QUANTUMIDE_FILE_TREE_EXPANDED_KEY,
} from '../common/quantumideFileExplorerTree.js';

const IGNORED = new Set(['node_modules', '.git', 'out', 'dist', '.build', '.cache']);

function nodeId(uri: URI): string {
	return uri.toString();
}

export class QuantumIDEFileExplorerTreeService extends Disposable implements IQuantumIDEFileExplorerTreeService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private readonly _childCache = new Map<string, readonly IQuantumIDEFileExplorerTreeNode[]>();
	private _loading = false;
	private _error: string | undefined;
	private _expanded = new Set<string>();

	constructor(
		@IWorkspaceContextService private readonly _workspace: IWorkspaceContextService,
		@IFileService private readonly _fileService: IFileService,
		@IStorageService private readonly _storage: IStorageService,
		@IQuantumIDEErrorRecoveryService private readonly _errors: IQuantumIDEErrorRecoveryService,
	) {
		super();
		this._expanded = new Set(this._readExpanded());
		this._register(this._workspace.onDidChangeWorkspaceFolders(() => { void this.refresh(); }));
		this._register(this._fileService.onDidFilesChange(() => {
			this._childCache.clear();
			this._onDidChange.fire();
		}));
	}

	isLoading(): boolean {
		return this._loading;
	}

	getLastError(): string | undefined {
		return this._error;
	}

	getExpandedPaths(): readonly string[] {
		return [...this._expanded];
	}

	setExpanded(nodeId: string, expanded: boolean): void {
		if (expanded) {
			this._expanded.add(nodeId);
		} else {
			this._expanded.delete(nodeId);
		}
		this._persistExpanded();
	}

	async refresh(): Promise<void> {
		this._childCache.clear();
		this._error = undefined;
		this._onDidChange.fire();
	}

	async getRootNodes(): Promise<readonly IQuantumIDEFileExplorerTreeNode[]> {
		const folders = this._workspace.getWorkspace().folders;
		if (!folders.length) {
			return [];
		}
		this._loading = true;
		this._onDidChange.fire();
		try {
			const roots: IQuantumIDEFileExplorerTreeNode[] = [];
			for (const folder of folders) {
				const id = nodeId(folder.uri);
				const children = this._expanded.has(id)
					? await this._loadDirectory(folder.uri, folder.name)
					: undefined;
				roots.push({
					id,
					label: folder.name || basename(folder.uri.fsPath),
					path: folder.uri.fsPath,
					isDirectory: true,
					resourceUri: folder.uri,
					children,
				});
				if (children) {
					this._childCache.set(id, children);
				}
			}
			return roots;
		} catch (err) {
			this._error = String(err);
			return [];
		} finally {
			this._loading = false;
			this._onDidChange.fire();
		}
	}

	async searchFlat(query: string, limit = 300): Promise<readonly IQuantumIDEFileExplorerTreeNode[]> {
		const q = query.trim().toLowerCase();
		if (!q) {
			return [];
		}
		const results: IQuantumIDEFileExplorerTreeNode[] = [];
		const queue: { uri: URI; basePath: string }[] = this._workspace.getWorkspace().folders.map(f => ({
			uri: f.uri,
			basePath: f.name || basename(f.uri.fsPath),
		}));
		while (queue.length > 0 && results.length < limit) {
			const { uri, basePath } = queue.shift()!;
			let stat;
			try {
				stat = await this._fileService.resolve(uri, { resolveMetadata: true });
			} catch {
				continue;
			}
			if (!stat.children) {
				continue;
			}
			for (const child of stat.children) {
				if (results.length >= limit) {
					break;
				}
				const name = child.name;
				if (name.startsWith('.') && name !== '.env') {
					continue;
				}
				if (IGNORED.has(name)) {
					continue;
				}
				const relPath = `${basePath}/${name}`;
				const matches = name.toLowerCase().includes(q) || relPath.toLowerCase().includes(q);
				const childUri = child.resource;
				if (matches) {
					results.push({
						id: nodeId(childUri),
						label: name,
						path: relPath,
						isDirectory: !!child.isDirectory,
						resourceUri: childUri,
					});
				}
				if (child.isDirectory) {
					queue.push({ uri: childUri, basePath: relPath });
				}
			}
		}
		return results;
	}

	async moveEntries(sources: readonly URI[], targetDirectory: URI): Promise<IQuantumIDEFileExplorerMoveResult> {
		const errors: string[] = [];
		let moved = 0;
		for (const source of sources) {
			if (source.toString() === targetDirectory.toString()) {
				errors.push(localize('quantumide.fileTree.sameTarget', 'Cannot move item onto itself.'));
				continue;
			}
			if (isEqualOrParent(targetDirectory, source)) {
				errors.push(localize('quantumide.fileTree.intoSelf', 'Cannot move a folder into itself or its children.'));
				continue;
			}
			try {
				const target = joinPath(targetDirectory, basename(source.path));
				await this._fileService.move(source, target, true);
				moved++;
			} catch (err) {
				errors.push(`${basename(source.path)}: ${String(err)}`);
			}
		}
		if (errors.length) {
			this._error = errors.join('\n');
			this._errors.report({
				id: generateUuid(),
				message: `${localize('quantumide.fileTree.moveFailed', 'Some files could not be moved.')}\n${this._error}`,
				recoverable: true,
				retryCommand: 'quantumide.fileTree.refresh',
			});
		} else {
			this._error = undefined;
		}
		this._childCache.clear();
		this._onDidChange.fire();
		return { moved, errors };
	}

	async renameEntry(source: URI, newName: string): Promise<{ ok: boolean; error?: string }> {
		const trimmed = newName.trim();
		if (!trimmed || trimmed.includes('/') || trimmed.includes('\\')) {
			return { ok: false, error: localize('quantumide.fileTree.badName', 'Invalid file name.') };
		}
		try {
			const target = joinPath(dirname(source), trimmed);
			await this._fileService.move(source, target, false);
			this._childCache.clear();
			this._onDidChange.fire();
			return { ok: true };
		} catch (err) {
			const message = String(err);
			this._error = message;
			this._errors.report({
				id: generateUuid(),
				message: `${localize('quantumide.fileTree.renameFailed', 'Rename failed.')} ${message}`,
				recoverable: false,
			});
			return { ok: false, error: message };
		}
	}

	async loadChildren(nodeId: string): Promise<readonly IQuantumIDEFileExplorerTreeNode[]> {
		const cached = this._childCache.get(nodeId);
		if (cached) {
			return cached;
		}
		const uri = URI.parse(nodeId);
		const stat = await this._fileService.resolve(uri);
		if (!stat.isDirectory) {
			return [];
		}
		const children = await this._loadDirectory(uri, basename(uri.fsPath) || uri.fsPath);
		this._childCache.set(nodeId, children);
		this._onDidChange.fire();
		return children;
	}

	private async _loadDirectory(uri: URI, basePath: string): Promise<readonly IQuantumIDEFileExplorerTreeNode[]> {
		const stat = await this._fileService.resolve(uri, { resolveMetadata: true });
		if (!stat.children) {
			return [];
		}
		const dirs: IQuantumIDEFileExplorerTreeNode[] = [];
		const files: IQuantumIDEFileExplorerTreeNode[] = [];
		for (const child of stat.children) {
			const name = child.name;
			if (name.startsWith('.') && name !== '.env') {
				continue;
			}
			if (IGNORED.has(name)) {
				continue;
			}
			const childUri = child.resource;
			const id = nodeId(childUri);
			const relPath = `${basePath}/${name}`;
			if (child.isDirectory) {
				const nested = this._expanded.has(id) ? await this._loadDirectory(childUri, relPath) : undefined;
				if (nested) {
					this._childCache.set(id, nested);
				}
				dirs.push({
					id,
					label: name,
					path: relPath,
					isDirectory: true,
					resourceUri: childUri,
					children: nested,
				});
			} else {
				files.push({
					id,
					label: name,
					path: relPath,
					isDirectory: false,
					resourceUri: childUri,
				});
			}
		}
		dirs.sort((a, b) => a.label.localeCompare(b.label));
		files.sort((a, b) => a.label.localeCompare(b.label));
		return [...dirs, ...files];
	}

	private _readExpanded(): string[] {
		try {
			const raw = this._storage.get(QUANTUMIDE_FILE_TREE_EXPANDED_KEY, StorageScope.WORKSPACE);
			if (!raw) {
				return [];
			}
			const parsed = JSON.parse(raw) as string[];
			return Array.isArray(parsed) ? parsed : [];
		} catch {
			return [];
		}
	}

	private _persistExpanded(): void {
		this._storage.store(
			QUANTUMIDE_FILE_TREE_EXPANDED_KEY,
			JSON.stringify([...this._expanded]),
			StorageScope.WORKSPACE,
			StorageTarget.USER,
		);
	}
}

registerSingleton(IQuantumIDEFileExplorerTreeService, QuantumIDEFileExplorerTreeService, InstantiationType.Delayed);
