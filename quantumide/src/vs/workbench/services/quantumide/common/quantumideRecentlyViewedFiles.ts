/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { URI } from '../../../../base/common/uri.js';

export interface IQuantumIDERecentlyViewedEntry {
	readonly uri: string;
	readonly workspaceRelativePath?: string;
	readonly viewedAt: number;
}

export interface IQuantumIDERecentlyViewedFilesService {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<void>;
	recordView(uri: URI, workspaceRelativePath?: string): void;
	getRecent(maxEntries?: number): readonly IQuantumIDERecentlyViewedEntry[];
}

export const IQuantumIDERecentlyViewedFilesService = createDecorator<IQuantumIDERecentlyViewedFilesService>('quantumIDERecentlyViewedFilesService');
