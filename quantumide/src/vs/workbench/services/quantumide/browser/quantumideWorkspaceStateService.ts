/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../base/common/buffer.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { extUriBiasedIgnorePathCase, joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { isCodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { Position as EditorPosition } from '../../../../editor/common/core/position.js';
import { Range } from '../../../../editor/common/core/range.js';
import { localize } from '../../../../nls.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService, type IWorkspaceFolder } from '../../../../platform/workspace/common/workspace.js';
import { EditorResourceAccessor, SideBySideEditor } from '../../../common/editor.js';
import { IEditorService } from '../../editor/common/editorService.js';
import { IEditorGroupsService } from '../../editor/common/editorGroupsService.js';
import { isMultiWindowPart, Parts, PanelAlignment, positionFromString, positionToString, IWorkbenchLayoutService } from '../../layout/browser/layoutService.js';
import { ITextFileService } from '../../textfile/common/textfiles.js';
import { ChatViewPaneTarget, IChatWidgetService } from '../../../contrib/chat/browser/chat.js';
import { IQuantumIDEChatEditSessionService } from './quantumideChatEditSessionService.js';
import { IQuantumIDEFileExplorerTreeService } from '../common/quantumideFileExplorerTree.js';
import {
	IQuantumIDEWorkspaceEditorResourceState,
	IQuantumIDEWorkspaceStateMeta,
	IQuantumIDEWorkspaceStatePayload,
	IQuantumIDEWorkspaceStatePersistOptions,
	IQuantumIDEWorkspaceStateService,
	QUANTUMIDE_SESSION_WORKING_SET_NAME,
	QUANTUMIDE_WORKSPACE_STATE_PAYLOAD_KEY,
	QUANTUMIDE_WORKSPACE_STATE_STORAGE_KEY,
	QUANTUMIDE_WORKSPACE_STATE_VERSION,
	quantumIDEWorkspaceStateRoot,
} from '../common/quantumideWorkspaceState.js';

/** Parts registered on the standard VS Code workbench layout (not Sessions-only CHATBAR_PART). */
const LAYOUT_PARTS: readonly Parts[] = [
	Parts.ACTIVITYBAR_PART,
	Parts.SIDEBAR_PART,
	Parts.PANEL_PART,
	Parts.AUXILIARYBAR_PART,
];

const MAX_OPEN_RESOURCES_IN_SESSION = 96;
const MAX_FILE_TREE_PATHS_IN_SESSION = 48;

/** Avoid blocking the UI when reopening large workspace sessions (.code-workspace). */
const MAX_RESTORE_OPEN_EDITORS = 24;
const RESTORE_YIELD_EVERY = 3;

function yieldToUi(): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, 0));
}

export class QuantumIDEWorkspaceStateService extends Disposable implements IQuantumIDEWorkspaceStateService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private _lastMeta: IQuantumIDEWorkspaceStateMeta | undefined;
	private _restoring = false;
	private _persistInFlight: Promise<IQuantumIDEWorkspaceStateMeta | undefined> | undefined;

	constructor(
		@IWorkspaceContextService private readonly _workspace: IWorkspaceContextService,
		@IFileService private readonly _files: IFileService,
		@IStorageService private readonly _storage: IStorageService,
		@IWorkbenchLayoutService private readonly _layout: IWorkbenchLayoutService,
		@IEditorGroupsService private readonly _editorGroups: IEditorGroupsService,
		@IEditorService private readonly _editorService: IEditorService,
		@ITextFileService private readonly _textFiles: ITextFileService,
		@IChatWidgetService private readonly _chatWidgets: IChatWidgetService,
		@IQuantumIDEChatEditSessionService private readonly _chatEdits: IQuantumIDEChatEditSessionService,
		@IQuantumIDEFileExplorerTreeService private readonly _fileTree: IQuantumIDEFileExplorerTreeService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._lastMeta = this._readMetaFromStorage();
	}

	getLastSavedMeta(): IQuantumIDEWorkspaceStateMeta | undefined {
		return this._lastMeta;
	}

	async captureState(label?: string, options: IQuantumIDEWorkspaceStatePersistOptions = {}): Promise<IQuantumIDEWorkspaceStatePayload> {
		if (this._restoring) {
			return this._captureMinimalState(label);
		}
		const parts = this._captureLayoutPartsSafe();

		let workingSetName: string | undefined;
		if (options.captureWorkingSet === true) {
			try {
				for (const ws of this._editorGroups.getWorkingSets()) {
					if (ws.name === QUANTUMIDE_SESSION_WORKING_SET_NAME) {
						this._editorGroups.deleteWorkingSet(ws);
					}
				}
				this._editorGroups.saveWorkingSet(QUANTUMIDE_SESSION_WORKING_SET_NAME);
				workingSetName = QUANTUMIDE_SESSION_WORKING_SET_NAME;
			} catch (err) {
				this._logService.warn('[QuantumIDE] Editor working set capture skipped', err);
			}
		}

		const openResources: string[] = [];
		for (const editor of this._editorService.editors) {
			if (openResources.length >= MAX_OPEN_RESOURCES_IN_SESSION) {
				break;
			}
			const resource = EditorResourceAccessor.getCanonicalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY });
			if (resource) {
				openResources.push(resource.toString());
			}
		}

		const editorResources: IQuantumIDEWorkspaceEditorResourceState[] = [];
		const control = this._editorService.activeTextEditorControl;
		if (isCodeEditor(control)) {
			const model = control.getModel();
			if (model) {
				const sel = control.getSelection();
				if (sel) {
					editorResources.push({
						resource: model.uri.toString(),
						cursorLine: sel.positionLineNumber,
						cursorColumn: sel.positionColumn,
						selectionStartLine: sel.startLineNumber,
						selectionStartColumn: sel.startColumn,
						selectionEndLine: sel.endLineNumber,
						selectionEndColumn: sel.endColumn,
					});
				}
			}
		}

		const active = this._editorService.activeEditor;
		const activeResource = active
			? EditorResourceAccessor.getCanonicalUri(active, { supportSideBySide: SideBySideEditor.PRIMARY })?.toString()
			: undefined;

		const dirtyResources: string[] = [];
		try {
			for (const model of this._textFiles.files.models) {
				if (model.isDirty()) {
					dirtyResources.push(model.resource.toString());
				}
			}
		} catch {
			// ignore
		}

		let activeChatSession: string | undefined;
		try {
			activeChatSession = this._chatWidgets.lastFocusedWidget?.viewModel?.sessionResource?.toString();
		} catch {
			// ignore
		}

		let panelPosition = 'bottom';
		let panelAlignment = 'center';
		try {
			panelPosition = positionToString(this._layout.getPanelPosition());
			panelAlignment = String(this._layout.getPanelAlignment());
		} catch (err) {
			this._logService.warn('[QuantumIDE] Layout metadata capture skipped', err);
		}

		let fileTreeExpanded: string[] = [];
		try {
			fileTreeExpanded = [...this._fileTree.getExpandedPaths()].slice(0, MAX_FILE_TREE_PATHS_IN_SESSION);
		} catch {
			// ignore
		}

		let pendingChatEdits = 0;
		try {
			pendingChatEdits = this._chatEdits.getPendingCount();
		} catch {
			// ignore
		}

		return {
			version: QUANTUMIDE_WORKSPACE_STATE_VERSION,
			savedAt: Date.now(),
			label,
			layout: { panelPosition, panelAlignment, parts },
			workingSetName,
			openResources,
			activeResource,
			editorResources,
			dirtyResources,
			activeChatSession,
			pendingChatEdits,
			fileTreeExpanded,
		};
	}

	async persistState(label?: string, options: IQuantumIDEWorkspaceStatePersistOptions = {}): Promise<IQuantumIDEWorkspaceStateMeta | undefined> {
		if (this._persistInFlight) {
			return this._persistInFlight;
		}
		this._persistInFlight = this._persistStateInner(label, options).finally(() => {
			this._persistInFlight = undefined;
		});
		return this._persistInFlight;
	}

	private async _persistStateInner(label: string | undefined, options: IQuantumIDEWorkspaceStatePersistOptions): Promise<IQuantumIDEWorkspaceStateMeta | undefined> {
		await this._layout.whenRestored;
		let payload: IQuantumIDEWorkspaceStatePayload;
		try {
			payload = await this.captureState(label, options);
		} catch (err) {
			this._logService.warn('[QuantumIDE] Full session capture failed; saving minimal snapshot', err);
			payload = await this._captureMinimalState(label);
		}
		payload = this._sanitizePayload(payload);

		const meta: IQuantumIDEWorkspaceStateMeta = {
			savedAt: payload.savedAt,
			label: payload.label,
			openFileCount: payload.openResources.length,
		};

		let storageOk = false;
		try {
			this._storage.store(QUANTUMIDE_WORKSPACE_STATE_PAYLOAD_KEY, JSON.stringify(payload), StorageScope.WORKSPACE, StorageTarget.USER);
			this._storage.store(QUANTUMIDE_WORKSPACE_STATE_STORAGE_KEY, JSON.stringify(meta), StorageScope.WORKSPACE, StorageTarget.USER);
			storageOk = true;
		} catch (err) {
			this._logService.warn('[QuantumIDE] Workspace session storage fallback failed', err);
		}

		const diskOk = await this._writePayloadToDisk(payload);

		if (storageOk || diskOk) {
			this._lastMeta = meta;
			this._onDidChange.fire();
			return meta;
		}

		const detail = localize('quantumide.workspaceState.persistNoTarget', 'No writable workspace folder and workspace storage is unavailable.');
		this._logService.error(`[QuantumIDE] Failed to save workspace session: ${detail}`);
		if (options.notifyOnFailure === true) {
			// Caller (Save Workspace Session command) shows a single notification — never QuantumIDE error-recovery toasts.
			return undefined;
		}
		return undefined;
	}

	async restoreLastState(): Promise<{ ok: boolean; error?: string }> {
		const payload = await this._loadLatestPayload();
		if (!payload) {
			return { ok: false, error: localize('quantumide.workspaceState.noFolder', 'No saved workspace session found.') };
		}
		return this._applyPayload(payload);
	}

	async listHistory(): Promise<readonly IQuantumIDEWorkspaceStateMeta[]> {
		const folder = this._resolvePersistFolder();
		if (!folder) {
			return this._lastMeta ? [this._lastMeta] : [];
		}
		const root = quantumIDEWorkspaceStateRoot(folder.uri);
		try {
			const stat = await this._files.resolve(root);
			if (!stat.children) {
				return this._lastMeta ? [this._lastMeta] : [];
			}
			const metas: IQuantumIDEWorkspaceStateMeta[] = [];
			for (const child of stat.children) {
				if (!child.name.endsWith('.json') || child.name === 'latest.json') {
					continue;
				}
				try {
					const parsed = JSON.parse((await this._files.readFile(child.resource)).value.toString()) as IQuantumIDEWorkspaceStatePayload;
					metas.push({
						savedAt: parsed.savedAt,
						label: parsed.label,
						openFileCount: parsed.openResources.length,
					});
				} catch {
					// skip corrupt
				}
			}
			return metas.sort((a, b) => b.savedAt - a.savedAt);
		} catch {
			return this._lastMeta ? [this._lastMeta] : [];
		}
	}

	async restoreFromHistory(savedAt: number): Promise<{ ok: boolean; error?: string }> {
		const folder = this._resolvePersistFolder();
		if (!folder) {
			return { ok: false, error: localize('quantumide.workspaceState.noFolder', 'Open a workspace folder first.') };
		}
		const uri = joinPath(quantumIDEWorkspaceStateRoot(folder.uri), `${savedAt}.json`);
		try {
			const raw = (await this._files.readFile(uri)).value.toString();
			return this._applyPayload(JSON.parse(raw) as IQuantumIDEWorkspaceStatePayload);
		} catch (err) {
			return { ok: false, error: String(err) };
		}
	}

	/** No background auto-save — prevents agent/chat/editor events from surfacing save errors. */
	scheduleAutoSave(): void {
		// intentional no-op
	}

	private _sanitizePayload(payload: IQuantumIDEWorkspaceStatePayload): IQuantumIDEWorkspaceStatePayload {
		return {
			...payload,
			openResources: payload.openResources.slice(0, MAX_OPEN_RESOURCES_IN_SESSION),
			fileTreeExpanded: payload.fileTreeExpanded.slice(0, MAX_FILE_TREE_PATHS_IN_SESSION),
		};
	}

	private async _loadLatestPayload(): Promise<IQuantumIDEWorkspaceStatePayload | undefined> {
		const folder = this._resolvePersistFolder();
		if (folder) {
			const latestUri = joinPath(quantumIDEWorkspaceStateRoot(folder.uri), 'latest.json');
			try {
				const raw = (await this._files.readFile(latestUri)).value.toString();
				return JSON.parse(raw) as IQuantumIDEWorkspaceStatePayload;
			} catch {
				// fall through to storage
			}
		}
		try {
			const raw = this._storage.get(QUANTUMIDE_WORKSPACE_STATE_PAYLOAD_KEY, StorageScope.WORKSPACE);
			if (raw) {
				return JSON.parse(raw) as IQuantumIDEWorkspaceStatePayload;
			}
		} catch {
			// ignore
		}
		return undefined;
	}

	private async _writePayloadToDisk(payload: IQuantumIDEWorkspaceStatePayload): Promise<boolean> {
		let json: string;
		try {
			json = JSON.stringify(payload, null, 2);
		} catch (err) {
			this._logService.warn('[QuantumIDE] Session JSON stringify failed', err);
			return false;
		}
		for (const folder of this._getFileWorkspaceFolders()) {
			try {
				const root = await this._ensureStateRoot(folder.uri);
				const latestUri = joinPath(root, 'latest.json');
				await this._writeStateJson(latestUri, json);
				try {
					const historyUri = joinPath(root, `${payload.savedAt}.json`);
					await this._writeStateJson(historyUri, json);
				} catch {
					// history is optional
				}
				return true;
			} catch (err) {
				this._logService.warn(`[QuantumIDE] Session disk write failed for ${folder.uri.fsPath}`, err);
			}
		}
		return false;
	}

	private async _captureMinimalState(label?: string): Promise<IQuantumIDEWorkspaceStatePayload> {
		const openResources: string[] = [];
		for (const editor of this._editorService.editors) {
			if (openResources.length >= MAX_OPEN_RESOURCES_IN_SESSION) {
				break;
			}
			const resource = EditorResourceAccessor.getCanonicalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY });
			if (resource) {
				openResources.push(resource.toString());
			}
		}
		const active = this._editorService.activeEditor;
		const activeResource = active
			? EditorResourceAccessor.getCanonicalUri(active, { supportSideBySide: SideBySideEditor.PRIMARY })?.toString()
			: undefined;
		return {
			version: QUANTUMIDE_WORKSPACE_STATE_VERSION,
			savedAt: Date.now(),
			label,
			layout: { panelPosition: 'bottom', panelAlignment: 'center', parts: {} },
			openResources,
			activeResource,
			editorResources: [],
			dirtyResources: [],
			pendingChatEdits: 0,
			fileTreeExpanded: [],
		};
	}

	private async _applyPayload(payload: IQuantumIDEWorkspaceStatePayload): Promise<{ ok: boolean; error?: string }> {
		if (payload.version !== QUANTUMIDE_WORKSPACE_STATE_VERSION) {
			return { ok: false, error: localize('quantumide.workspaceState.versionMismatch', 'Workspace session version is not supported.') };
		}
		this._restoring = true;
		try {
			if (payload.workingSetName) {
				const match = this._editorGroups.getWorkingSets().find(w => w.name === payload.workingSetName);
				if (match) {
					await this._editorGroups.applyWorkingSet(match);
				}
			}

			await this._openRestoredEditors(payload.openResources, payload.activeResource);

			this._applyLayoutPartsSafe(payload.layout.parts);

			if (payload.layout.panelPosition) {
				try {
					this._layout.setPanelPosition(positionFromString(payload.layout.panelPosition));
				} catch {
					// ignore
				}
			}
			const alignment = payload.layout.panelAlignment as PanelAlignment;
			if (alignment === 'left' || alignment === 'center' || alignment === 'right' || alignment === 'justify') {
				try {
					this._layout.setPanelAlignment(alignment);
				} catch {
					// ignore
				}
			}

			const activeControl = this._editorService.activeTextEditorControl;
			const ed = payload.editorResources[0];
			if (isCodeEditor(activeControl) && ed && activeControl.getModel()?.uri.toString() === ed.resource) {
				if (ed.selectionStartLine && ed.selectionEndLine) {
					activeControl.setSelection(new Range(
						ed.selectionStartLine,
						ed.selectionStartColumn ?? 1,
						ed.selectionEndLine,
						ed.selectionEndColumn ?? 1,
					));
				} else if (ed.cursorLine) {
					activeControl.setPosition(new EditorPosition(ed.cursorLine, ed.cursorColumn ?? 1));
				}
			}

			for (const path of payload.fileTreeExpanded) {
				try {
					this._fileTree.setExpanded(path, true);
				} catch {
					// ignore
				}
			}

			if (payload.activeChatSession) {
				try {
					await this._chatWidgets.openSession(URI.parse(payload.activeChatSession), ChatViewPaneTarget);
				} catch {
					// ignore
				}
			}

			this._ensureWorkbenchShellVisible(payload);

			this._onDidChange.fire();
			return { ok: true };
		} catch (err) {
			return { ok: false, error: String(err) };
		} finally {
			this._restoring = false;
		}
	}

	private async _openRestoredEditors(openResources: readonly string[], activeResource?: string): Promise<void> {
		const inactive = openResources
			.filter(r => r !== activeResource)
			.slice(0, MAX_RESTORE_OPEN_EDITORS);
		let opened = 0;
		for (const resource of inactive) {
			try {
				await this._editorService.openEditor({ resource: URI.parse(resource), options: { inactive: true, preserveFocus: true } });
			} catch {
				// file may have been deleted
			}
			opened++;
			if (opened % RESTORE_YIELD_EVERY === 0) {
				await yieldToUi();
			}
		}
		if (activeResource) {
			try {
				await this._editorService.openEditor({ resource: URI.parse(activeResource) });
			} catch {
				// file may have been deleted
			}
		} else if (!this._editorService.activeEditor && inactive.length > 0) {
			try {
				await this._editorService.openEditor({ resource: URI.parse(inactive[0]) });
			} catch {
				// ignore
			}
		}
	}

	private async _ensureStateRoot(folderUri: URI): Promise<URI> {
		const quantumideDir = joinPath(folderUri, '.quantumide');
		await this._files.createFolder(quantumideDir);
		const root = quantumIDEWorkspaceStateRoot(folderUri);
		await this._files.createFolder(root);
		return root;
	}

	private async _writeStateJson(uri: URI, json: string): Promise<void> {
		const buffer = VSBuffer.fromString(json);
		try {
			if (await this._files.exists(uri)) {
				await this._files.writeFile(uri, buffer);
			} else {
				await this._files.createFile(uri, buffer, { overwrite: true });
			}
		} catch (err) {
			if (await this._files.exists(uri)) {
				throw err;
			}
			await this._files.writeFile(uri, buffer);
		}
	}

	private _getFileWorkspaceFolders(): readonly IWorkspaceFolder[] {
		return this._workspace.getWorkspace().folders.filter(f => f.uri.scheme === 'file');
	}

	private _resolvePersistFolder(): IWorkspaceFolder | undefined {
		const fileFolders = this._getFileWorkspaceFolders();
		if (fileFolders.length === 0) {
			return undefined;
		}
		const active = this._editorService.activeEditor;
		const activeUri = active
			? EditorResourceAccessor.getCanonicalUri(active, { supportSideBySide: SideBySideEditor.PRIMARY })
			: undefined;
		if (activeUri) {
			for (const folder of fileFolders) {
				if (extUriBiasedIgnorePathCase.isEqualOrParent(activeUri, folder.uri)) {
					return folder;
				}
			}
		}
		return fileFolders[0];
	}

	private _captureLayoutPartsSafe(): Record<string, { visible: boolean; width: number; height: number }> {
		const parts: Record<string, { visible: boolean; width: number; height: number }> = {};
		for (const part of LAYOUT_PARTS) {
			if (isMultiWindowPart(part)) {
				continue;
			}
			try {
				const size = this._layout.getSize(part);
				parts[part] = {
					visible: this._layout.isVisible(part),
					width: size.width,
					height: size.height,
				};
			} catch {
				// Part not registered on this workbench layout.
			}
		}
		return parts;
	}

	private _applyLayoutPartsSafe(parts: Record<string, { visible: boolean; width: number; height: number }>): void {
		for (const part of LAYOUT_PARTS) {
			if (isMultiWindowPart(part)) {
				continue;
			}
			const state = parts[part];
			if (!state) {
				continue;
			}
			try {
				this._layout.setPartHidden(!state.visible, part);
				if (state.visible) {
					this._layout.setSize(part, { width: state.width, height: state.height });
				}
			} catch {
				// ignore
			}
		}
	}

	private _ensureWorkbenchShellVisible(payload: IQuantumIDEWorkspaceStatePayload): void {
		try {
			this._layout.setPartHidden(false, Parts.EDITOR_PART);
			const chromeParts = LAYOUT_PARTS.filter(p => p !== Parts.AUXILIARYBAR_PART);
			const allChromeHidden = chromeParts.every(p => payload.layout.parts[p]?.visible === false);
			if (allChromeHidden) {
				this._layout.setPartHidden(false, Parts.ACTIVITYBAR_PART);
				this._layout.setPartHidden(false, Parts.SIDEBAR_PART);
			}
		} catch {
			// ignore
		}
	}

	private _readMetaFromStorage(): IQuantumIDEWorkspaceStateMeta | undefined {
		try {
			const raw = this._storage.get(QUANTUMIDE_WORKSPACE_STATE_STORAGE_KEY, StorageScope.WORKSPACE);
			if (!raw) {
				return undefined;
			}
			return JSON.parse(raw) as IQuantumIDEWorkspaceStateMeta;
		} catch {
			return undefined;
		}
	}
}

registerSingleton(IQuantumIDEWorkspaceStateService, QuantumIDEWorkspaceStateService, InstantiationType.Delayed);
