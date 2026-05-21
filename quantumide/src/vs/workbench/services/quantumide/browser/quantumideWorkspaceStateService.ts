/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../base/common/async.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { isCodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { Position as EditorPosition } from '../../../../editor/common/core/position.js';
import { Range } from '../../../../editor/common/core/range.js';
import { localize } from '../../../../nls.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { EditorResourceAccessor, SideBySideEditor } from '../../../common/editor.js';
import { IEditorService } from '../../editor/common/editorService.js';
import { IEditorGroupsService } from '../../editor/common/editorGroupsService.js';
import { isMultiWindowPart, Parts, PanelAlignment, positionFromString, positionToString, IWorkbenchLayoutService } from '../../layout/browser/layoutService.js';
import { ITextFileService } from '../../textfile/common/textfiles.js';
import { ChatViewPaneTarget, IChatWidgetService } from '../../../contrib/chat/browser/chat.js';
import { IQuantumIDEChatEditSessionService } from './quantumideChatEditSessionService.js';
import { IQuantumIDEFileExplorerTreeService } from '../common/quantumideFileExplorerTree.js';
import {
	IQuantumIDEWorkspaceStateMeta,
	IQuantumIDEWorkspaceStatePayload,
	IQuantumIDEWorkspaceStateService,
	QUANTUMIDE_SESSION_WORKING_SET_NAME,
	QUANTUMIDE_WORKSPACE_STATE_DIR,
	QUANTUMIDE_WORKSPACE_STATE_STORAGE_KEY,
	QUANTUMIDE_WORKSPACE_STATE_VERSION,
} from '../common/quantumideWorkspaceState.js';
import { IQuantumIDEErrorRecoveryService } from '../common/quantumideErrorRecovery.js';

const LAYOUT_PARTS: readonly Parts[] = [
	Parts.ACTIVITYBAR_PART,
	Parts.SIDEBAR_PART,
	Parts.PANEL_PART,
	Parts.AUXILIARYBAR_PART,
	Parts.CHATBAR_PART,
];

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
		@IQuantumIDEErrorRecoveryService private readonly _errors: IQuantumIDEErrorRecoveryService,
	) {
		super();
		this._lastMeta = this._readMetaFromStorage();
	}

	getLastSavedMeta(): IQuantumIDEWorkspaceStateMeta | undefined {
		return this._lastMeta;
	}

	async captureState(label?: string): Promise<IQuantumIDEWorkspaceStatePayload> {
		const parts: Record<string, { visible: boolean; width: number; height: number }> = {};
		for (const part of LAYOUT_PARTS) {
			if (isMultiWindowPart(part)) {
				continue;
			}
			const size = this._layout.getSize(part);
			parts[part] = {
				visible: this._layout.isVisible(part),
				width: size.width,
				height: size.height,
			};
		}

		for (const ws of this._editorGroups.getWorkingSets()) {
			if (ws.name === QUANTUMIDE_SESSION_WORKING_SET_NAME) {
				this._editorGroups.deleteWorkingSet(ws);
			}
		}
		this._editorGroups.saveWorkingSet(QUANTUMIDE_SESSION_WORKING_SET_NAME);

		const openResources: string[] = [];
		const editorResources: {
			resource: string;
			cursorLine?: number;
			cursorColumn?: number;
			selectionStartLine?: number;
			selectionStartColumn?: number;
			selectionEndLine?: number;
			selectionEndColumn?: number;
		}[] = [];

		for (const editor of this._editorService.editors) {
			const resource = EditorResourceAccessor.getCanonicalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY });
			if (!resource) {
				continue;
			}
			openResources.push(resource.toString());
		}

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
		for (const model of this._textFiles.files.models) {
			if (model.isDirty()) {
				dirtyResources.push(model.resource.toString());
			}
		}

		const chatWidget = this._chatWidgets.lastFocusedWidget;
		const activeChatSession = chatWidget?.viewModel?.sessionResource?.toString();

		return {
			version: QUANTUMIDE_WORKSPACE_STATE_VERSION,
			savedAt: Date.now(),
			label,
			layout: {
				panelPosition: positionToString(this._layout.getPanelPosition()),
				panelAlignment: String(this._layout.getPanelAlignment()),
				parts,
			},
			workingSetName: QUANTUMIDE_SESSION_WORKING_SET_NAME,
			openResources,
			activeResource,
			editorResources,
			dirtyResources,
			activeChatSession,
			pendingChatEdits: this._chatEdits.getPendingCount(),
			fileTreeExpanded: this._fileTree.getExpandedPaths(),
		};
	}

	async persistState(label?: string): Promise<IQuantumIDEWorkspaceStateMeta | undefined> {
		const folder = this._workspace.getWorkspace().folders[0];
		if (!folder) {
			return undefined;
		}
		try {
			const payload = await this.captureState(label);
			const root = joinPath(folder.uri, QUANTUMIDE_WORKSPACE_STATE_DIR);
			await this._files.createFolder(root);
			const latestUri = joinPath(root, 'latest.json');
			const historyUri = joinPath(root, `${payload.savedAt}.json`);
			const json = JSON.stringify(payload, null, 2);
			await this._files.writeFile(latestUri, VSBuffer.fromString(json));
			await this._files.writeFile(historyUri, VSBuffer.fromString(json));
			const history = await this.listHistory();
			for (const entry of history.slice(20)) {
				try {
					await this._files.del(joinPath(root, `${entry.savedAt}.json`));
				} catch {
					// ignore
				}
			}
			const meta: IQuantumIDEWorkspaceStateMeta = {
				savedAt: payload.savedAt,
				label: payload.label,
				openFileCount: payload.openResources.length,
			};
			this._storage.store(QUANTUMIDE_WORKSPACE_STATE_STORAGE_KEY, JSON.stringify(meta), StorageScope.WORKSPACE, StorageTarget.USER);
			this._lastMeta = meta;
			this._onDidChange.fire();
			return meta;
		} catch (err) {
			this._errors.report({
				id: generateUuid(),
				message: localize('quantumide.workspaceState.persistFailed', 'Failed to save workspace session.'),
				recoverable: true,
				retryCommand: 'quantumide.workspace.saveSession',
			});
			return undefined;
		}
	}

	async restoreLastState(): Promise<{ ok: boolean; error?: string }> {
		const folder = this._workspace.getWorkspace().folders[0];
		if (!folder) {
			return { ok: false, error: localize('quantumide.workspaceState.noFolder', 'Open a workspace folder first.') };
		}
		const latestUri = joinPath(folder.uri, QUANTUMIDE_WORKSPACE_STATE_DIR, 'latest.json');
		try {
			const raw = (await this._files.readFile(latestUri)).value.toString();
			const payload = JSON.parse(raw) as IQuantumIDEWorkspaceStatePayload;
			return this._applyPayload(payload);
		} catch (err) {
			return { ok: false, error: String(err) };
		}
	}

	async listHistory(): Promise<readonly IQuantumIDEWorkspaceStateMeta[]> {
		const folder = this._workspace.getWorkspace().folders[0];
		if (!folder) {
			return [];
		}
		const root = joinPath(folder.uri, QUANTUMIDE_WORKSPACE_STATE_DIR);
		try {
			const stat = await this._files.resolve(root);
			if (!stat.children) {
				return [];
			}
			const metas: IQuantumIDEWorkspaceStateMeta[] = [];
			for (const child of stat.children) {
				if (!child.name.endsWith('.json') || child.name === 'latest.json') {
					continue;
				}
				try {
					const payload = JSON.parse((await this._files.readFile(child.resource)).value.toString()) as IQuantumIDEWorkspaceStatePayload;
					metas.push({
						savedAt: payload.savedAt,
						label: payload.label,
						openFileCount: payload.openResources.length,
					});
				} catch {
					// skip corrupt
				}
			}
			return metas.sort((a, b) => b.savedAt - a.savedAt);
		} catch {
			return [];
		}
	}

	async restoreFromHistory(savedAt: number): Promise<{ ok: boolean; error?: string }> {
		const folder = this._workspace.getWorkspace().folders[0];
		if (!folder) {
			return { ok: false, error: localize('quantumide.workspaceState.noFolder', 'Open a workspace folder first.') };
		}
		const uri = joinPath(folder.uri, QUANTUMIDE_WORKSPACE_STATE_DIR, `${savedAt}.json`);
		try {
			const raw = (await this._files.readFile(uri)).value.toString();
			return this._applyPayload(JSON.parse(raw) as IQuantumIDEWorkspaceStatePayload);
		} catch (err) {
			return { ok: false, error: String(err) };
		}
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

			for (const part of LAYOUT_PARTS) {
				if (isMultiWindowPart(part)) {
					continue;
				}
				const state = payload.layout.parts[part];
				if (!state) {
					continue;
				}
				this._layout.setPartHidden(!state.visible, part);
				if (state.visible) {
					this._layout.setSize(part, { width: state.width, height: state.height });
				}
			}

			if (payload.layout.panelPosition) {
				this._layout.setPanelPosition(positionFromString(payload.layout.panelPosition));
			}
			const alignment = payload.layout.panelAlignment as PanelAlignment;
			if (alignment === 'left' || alignment === 'center' || alignment === 'right' || alignment === 'justify') {
				this._layout.setPanelAlignment(alignment);
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
				this._fileTree.setExpanded(path, true);
			}

			if (payload.activeChatSession) {
				await this._chatWidgets.openSession(URI.parse(payload.activeChatSession), ChatViewPaneTarget);
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

	private _ensureWorkbenchShellVisible(payload: IQuantumIDEWorkspaceStatePayload): void {
		this._layout.setPartHidden(false, Parts.EDITOR_PART);
		const chromeParts = LAYOUT_PARTS.filter(p => p !== Parts.AUXILIARYBAR_PART && p !== Parts.CHATBAR_PART);
		const allChromeHidden = chromeParts.every(p => payload.layout.parts[p]?.visible === false);
		if (allChromeHidden) {
			this._layout.setPartHidden(false, Parts.ACTIVITYBAR_PART);
			this._layout.setPartHidden(false, Parts.SIDEBAR_PART);
		}
	}

	scheduleAutoSave(): void {
		this._autoSaveScheduler.schedule();
	}

	private readonly _autoSaveScheduler = this._register(new RunOnceScheduler(() => {
		if (this._restoring) {
			return;
		}
		void this.persistState();
	}, 2500));

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
