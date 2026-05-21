/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { basename } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { Range } from '../../../../editor/common/core/range.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IEditorService } from '../../editor/common/editorService.js';
import { IQuantumIDEWorkspaceContextService } from '../common/quantumideWorkspaceContext.js';

export interface IQuantumIDEFileTreeEntry {
	readonly path: string;
	readonly name: string;
	readonly isDirectory?: boolean;
}

export interface IQuantumIDEFileNavigationService {
	readonly _serviceBrand: undefined;
	openFile(path: string, line?: number, column?: number): Promise<boolean>;
	goToLine(path: string, line: number, column?: number): Promise<boolean>;
	listWorkspaceTree(maxEntries?: number, prefix?: string): Promise<readonly IQuantumIDEFileTreeEntry[]>;
}

export const IQuantumIDEFileNavigationService = createDecorator<IQuantumIDEFileNavigationService>('quantumIDEFileNavigationService');

export class QuantumIDEFileNavigationService implements IQuantumIDEFileNavigationService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IEditorService private readonly _editorService: IEditorService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IQuantumIDEWorkspaceContextService private readonly _workspaceContext: IQuantumIDEWorkspaceContextService,
	) { }

	async openFile(path: string, line?: number, column?: number): Promise<boolean> {
		const uri = this._resolvePath(path);
		if (!uri) {
			return false;
		}
		await this._editorService.openEditor({ resource: uri, options: { selection: line ? new Range(line, column ?? 1, line, column ?? 1) : undefined } });
		return true;
	}

	async goToLine(path: string, line: number, column = 1): Promise<boolean> {
		return this.openFile(path, line, column);
	}

	async listWorkspaceTree(maxEntries = 200, prefix?: string): Promise<readonly IQuantumIDEFileTreeEntry[]> {
		const graph = this._workspaceContext.getWorkspaceGraph();
		if (!graph?.files.length) {
			await this._workspaceContext.refreshWorkspaceGraph('file tree');
		}
		const files = this._workspaceContext.getWorkspaceGraph()?.files ?? [];
		const normalizedPrefix = prefix?.replace(/\\/g, '/').replace(/^\.\//, '');
		const filtered = normalizedPrefix
			? files.filter(f => f.workspaceRelativePath.startsWith(normalizedPrefix))
			: files;
		const dirs = new Set<string>();
		for (const file of filtered) {
			const parts = file.workspaceRelativePath.split('/');
			for (let i = 1; i < parts.length; i++) {
				dirs.add(parts.slice(0, i).join('/'));
			}
		}
		const entries: IQuantumIDEFileTreeEntry[] = [];
		for (const dir of [...dirs].sort().slice(0, maxEntries / 2)) {
			entries.push({ path: dir, name: basename(dir) || dir, isDirectory: true });
		}
		for (const file of filtered.slice(0, maxEntries - entries.length)) {
			entries.push({ path: file.workspaceRelativePath, name: file.name });
		}
		return entries.slice(0, maxEntries);
	}

	private _resolvePath(path: string): URI | undefined {
		const folder = this._workspaceContextService.getWorkspace().folders[0];
		if (!folder) {
			return undefined;
		}
		if (path.startsWith('file://')) {
			return URI.parse(path);
		}
		const clean = path.replace(/\\/g, '/').replace(/^\.\//, '');
		return URI.joinPath(folder.uri, clean);
	}
}

registerSingleton(IQuantumIDEFileNavigationService, QuantumIDEFileNavigationService, InstantiationType.Delayed);
