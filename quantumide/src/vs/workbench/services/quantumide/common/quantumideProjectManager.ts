/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export interface IQuantumIDEProjectEntry {
	readonly uri: URI;
	readonly name: string;
	readonly index: number;
	readonly isActive: boolean;
	readonly error?: string;
}

export interface IQuantumIDEProjectManagerService {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<void>;
	getProjects(): readonly IQuantumIDEProjectEntry[];
	getRecentProjects(): readonly { uri: string; name: string; openedAt: number }[];
	recordRecent(uri: URI, name: string): void;
	addFolderFromPicker(): Promise<{ ok: boolean; error?: string }>;
	removeFolder(uri: URI): Promise<{ ok: boolean; error?: string }>;
	openFolder(): Promise<{ ok: boolean; error?: string }>;
	switchToFolder(uri: URI): Promise<{ ok: boolean; error?: string }>;
	isBusy(): boolean;
}

export const IQuantumIDEProjectManagerService = createDecorator<IQuantumIDEProjectManagerService>('quantumIDEProjectManagerService');

export const QUANTUMIDE_RECENT_PROJECTS_KEY = 'quantumide.chat.recentProjects';
