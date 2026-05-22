/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const QUANTUMIDE_WORKSPACE_STATE_VERSION = 1;
export const QUANTUMIDE_WORKSPACE_STATE_STORAGE_KEY = 'quantumide.workspaceState.latest';
/** Full session payload fallback when `.quantumide/workspace-state` on disk is unavailable. */
export const QUANTUMIDE_WORKSPACE_STATE_PAYLOAD_KEY = 'quantumide.workspaceState.payload';
/** @deprecated Use {@link quantumIDEWorkspaceStateRoot} — single-segment join breaks on some paths. */
export const QUANTUMIDE_WORKSPACE_STATE_DIR = '.quantumide/workspace-state';

export function quantumIDEWorkspaceStateRoot(folderUri: URI): URI {
	return joinPath(joinPath(folderUri, '.quantumide'), 'workspace-state');
}
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

export interface IQuantumIDEWorkspaceStatePersistOptions {
	/** When true, snapshots editor working sets (heavier; use for manual save only). */
	readonly captureWorkingSet?: boolean;
	/** When true, callers may surface failure to the user (manual Save Workspace Session only). */
	readonly notifyOnFailure?: boolean;
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
	captureState(label?: string, options?: IQuantumIDEWorkspaceStatePersistOptions): Promise<IQuantumIDEWorkspaceStatePayload>;
	persistState(label?: string, options?: IQuantumIDEWorkspaceStatePersistOptions): Promise<IQuantumIDEWorkspaceStateMeta | undefined>;
	restoreLastState(): Promise<{ ok: boolean; error?: string }>;
	listHistory(): Promise<readonly IQuantumIDEWorkspaceStateMeta[]>;
	restoreFromHistory(savedAt: number): Promise<{ ok: boolean; error?: string }>;
	/** @deprecated No-op; session save is manual via **QuantumIDE: Save Workspace Session**. */
	scheduleAutoSave(): void;
}

export const IQuantumIDEWorkspaceStateService = createDecorator<IQuantumIDEWorkspaceStateService>('quantumIDEWorkspaceStateService');
