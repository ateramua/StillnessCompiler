/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const QUANTUMIDE_WORKSPACE_STATE_VERSION = 1;
export const QUANTUMIDE_WORKSPACE_STATE_STORAGE_KEY = 'quantumide.workspaceState.latest';
export const QUANTUMIDE_WORKSPACE_STATE_DIR = '.quantumide/workspace-state';
export const QUANTUMIDE_SESSION_WORKING_SET_NAME = 'QuantumIDE Session';

export interface IQuantumIDEWorkspacePartLayoutState {
	readonly visible: boolean;
	readonly width: number;
	readonly height: number;
}

export interface IQuantumIDEWorkspaceLayoutState {
	readonly panelPosition: string;
	readonly panelAlignment: string;
	readonly parts: Record<string, IQuantumIDEWorkspacePartLayoutState>;
}

export interface IQuantumIDEWorkspaceEditorResourceState {
	readonly resource: string;
	readonly cursorLine?: number;
	readonly cursorColumn?: number;
	readonly selectionStartLine?: number;
	readonly selectionStartColumn?: number;
	readonly selectionEndLine?: number;
	readonly selectionEndColumn?: number;
}

export interface IQuantumIDEWorkspaceStatePayload {
	readonly version: number;
	readonly savedAt: number;
	readonly label?: string;
	readonly layout: IQuantumIDEWorkspaceLayoutState;
	readonly workingSetName?: string;
	readonly openResources: readonly string[];
	readonly activeResource?: string;
	readonly editorResources: readonly IQuantumIDEWorkspaceEditorResourceState[];
	readonly dirtyResources: readonly string[];
	readonly activeChatSession?: string;
	readonly pendingChatEdits: number;
	readonly fileTreeExpanded: readonly string[];
}

export interface IQuantumIDEWorkspaceStateMeta {
	readonly savedAt: number;
	readonly label?: string;
	readonly openFileCount: number;
}

export interface IQuantumIDEWorkspaceStateService {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<void>;
	getLastSavedMeta(): IQuantumIDEWorkspaceStateMeta | undefined;
	captureState(label?: string): Promise<IQuantumIDEWorkspaceStatePayload>;
	persistState(label?: string): Promise<IQuantumIDEWorkspaceStateMeta | undefined>;
	restoreLastState(): Promise<{ ok: boolean; error?: string }>;
	listHistory(): Promise<readonly IQuantumIDEWorkspaceStateMeta[]>;
	restoreFromHistory(savedAt: number): Promise<{ ok: boolean; error?: string }>;
	scheduleAutoSave(): void;
}

export const IQuantumIDEWorkspaceStateService = createDecorator<IQuantumIDEWorkspaceStateService>('quantumIDEWorkspaceStateService');
