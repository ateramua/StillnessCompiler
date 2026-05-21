/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export interface IQuantumIDEChatScmFileEntry {
	readonly path: string;
	readonly uri: URI;
	readonly status: 'staged' | 'unstaged' | 'conflict' | 'untracked' | 'ignored';
}

export interface IQuantumIDEChatScmRepoState {
	readonly providerLabel: string;
	readonly branch?: string;
	readonly remoteBranch?: string;
	readonly files: readonly IQuantumIDEChatScmFileEntry[];
	readonly hasConflicts: boolean;
}

export interface IQuantumIDEChatScmPanelService {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<void>;
	getRepositories(): readonly IQuantumIDEChatScmRepoState[];
	refresh(): void;
}

export const IQuantumIDEChatScmPanelService = createDecorator<IQuantumIDEChatScmPanelService>('quantumIDEChatScmPanelService');
