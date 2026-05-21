/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const QUANTUMIDE_FILE_TREE_EXPANDED_KEY = 'quantumide.chat.fileTree.expanded';

export interface IQuantumIDEFileExplorerTreeNode {
	readonly id: string;
	readonly label: string;
	readonly path: string;
	readonly isDirectory: boolean;
	readonly children?: readonly IQuantumIDEFileExplorerTreeNode[];
	readonly resourceUri?: URI;
	readonly badge?: string;
	readonly status?: 'modified' | 'staged' | 'conflict';
}

export interface IQuantumIDEFileExplorerMoveResult {
	readonly moved: number;
	readonly errors: readonly string[];
}

export interface IQuantumIDEFileExplorerTreeService {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<void>;
	getRootNodes(): Promise<readonly IQuantumIDEFileExplorerTreeNode[]>;
	loadChildren(nodeId: string): Promise<readonly IQuantumIDEFileExplorerTreeNode[]>;
	searchFlat(query: string, limit?: number): Promise<readonly IQuantumIDEFileExplorerTreeNode[]>;
	moveEntries(sources: readonly URI[], targetDirectory: URI): Promise<IQuantumIDEFileExplorerMoveResult>;
	renameEntry(source: URI, newName: string): Promise<{ ok: boolean; error?: string }>;
	getExpandedPaths(): readonly string[];
	setExpanded(nodeId: string, expanded: boolean): void;
	refresh(): Promise<void>;
	isLoading(): boolean;
	getLastError(): string | undefined;
}

export const IQuantumIDEFileExplorerTreeService = createDecorator<IQuantumIDEFileExplorerTreeService>('quantumIDEFileExplorerTreeService');
