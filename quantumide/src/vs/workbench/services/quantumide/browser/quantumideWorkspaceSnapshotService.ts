/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../base/common/buffer.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { joinPath } from '../../../../base/common/resources.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { ITextFileService } from '../../textfile/common/textfiles.js';
import {
	IQuantumIDEWorkspaceSnapshotDiff,
	IQuantumIDEWorkspaceSnapshotMeta,
	IQuantumIDEWorkspaceSnapshotService,
	IQuantumIDEWorkspaceTimelineEntry,
	QUANTUMIDE_SNAPSHOTS_DIR,
} from '../common/quantumideWorkspaceSnapshot.js';
import { IQuantumIDEErrorRecoveryService } from '../common/quantumideErrorRecovery.js';
import { IQuantumIDEDiffReviewService } from './quantumideDiffReviewService.js';

interface ISnapshotManifest {
	readonly id: string;
	readonly label: string;
	readonly createdAt: number;
	readonly files: Record<string, string>;
	readonly contentHash?: string;
}

function hashSnapshotFiles(files: Record<string, string>): string {
	const keys = Object.keys(files).sort();
	let h = 0;
	const body = keys.map(k => `${k}\0${files[k]}`).join('\0');
	for (let i = 0; i < body.length; i++) {
		h = ((h << 5) - h + body.charCodeAt(i)) | 0;
	}
	return `qsh-${(h >>> 0).toString(16)}`;
}

export class QuantumIDEWorkspaceSnapshotService extends Disposable implements IQuantumIDEWorkspaceSnapshotService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	constructor(
		@IWorkspaceContextService private readonly _workspace: IWorkspaceContextService,
		@IFileService private readonly _files: IFileService,
		@ITextFileService private readonly _textFiles: ITextFileService,
		@IQuantumIDEErrorRecoveryService private readonly _errors: IQuantumIDEErrorRecoveryService,
		@IQuantumIDEDiffReviewService private readonly _diffReview: IQuantumIDEDiffReviewService,
	) {
		super();
	}

	private _snapshotsRoot() {
		const folder = this._workspace.getWorkspace().folders[0];
		if (!folder) {
			return undefined;
		}
		return joinPath(folder.uri, QUANTUMIDE_SNAPSHOTS_DIR);
	}

	async listTimeline(): Promise<readonly IQuantumIDEWorkspaceTimelineEntry[]> {
		const code = await this.listSnapshots();
		const entries: IQuantumIDEWorkspaceTimelineEntry[] = code.map(s => ({
			kind: 'code-snapshot',
			id: s.id,
			label: s.label,
			createdAt: s.createdAt,
			fileCount: s.fileCount,
		}));
		return entries.sort((a, b) => b.createdAt - a.createdAt);
	}

	async listSnapshots(): Promise<readonly IQuantumIDEWorkspaceSnapshotMeta[]> {
		const root = this._snapshotsRoot();
		if (!root) {
			return [];
		}
		try {
			const stat = await this._files.resolve(root);
			if (!stat.children) {
				return [];
			}
			const out: IQuantumIDEWorkspaceSnapshotMeta[] = [];
			for (const child of stat.children) {
				if (!child.name.endsWith('.json')) {
					continue;
				}
				try {
					const raw = (await this._files.readFile(child.resource)).value.toString();
					const m = JSON.parse(raw) as ISnapshotManifest;
					out.push({
						id: m.id,
						label: m.label,
						createdAt: m.createdAt,
						fileCount: Object.keys(m.files).length,
					});
				} catch {
					// skip corrupt
				}
			}
			return out.sort((a, b) => b.createdAt - a.createdAt);
		} catch {
			return [];
		}
	}

	async createSnapshot(label?: string): Promise<IQuantumIDEWorkspaceSnapshotMeta> {
		const root = this._snapshotsRoot();
		const folder = this._workspace.getWorkspace().folders[0];
		if (!root || !folder) {
			throw new Error(localize('quantumide.snapshot.noWorkspace', 'Open a workspace to create snapshots.'));
		}
		await this._files.createFolder(root);
		const id = generateUuid();
		const files: Record<string, string> = {};
		for (const model of this._textFiles.files.models) {
			if (model.isDisposed()) {
				continue;
			}
			const rel = this._workspace.getWorkspaceFolder(model.resource);
			if (!rel) {
				continue;
			}
			const path = model.resource.path.replace(folder.uri.path, '').replace(/^\//, '');
			files[path] = model.textEditorModel?.getValue() ?? '';
		}
		const contentHash = hashSnapshotFiles(files);
		const existing = await this.listSnapshots();
		for (const snap of existing) {
			try {
				const raw = (await this._files.readFile(joinPath(root, `${snap.id}.json`))).value.toString();
				const m = JSON.parse(raw) as ISnapshotManifest & { contentHash?: string };
				if (m.contentHash === contentHash) {
					return { id: m.id, label: m.label, createdAt: m.createdAt, fileCount: Object.keys(m.files).length };
				}
			} catch {
				// skip
			}
		}
		const manifest: ISnapshotManifest = {
			id,
			label: label ?? localize('quantumide.snapshot.defaultLabel', 'Snapshot {0}', new Date().toLocaleString()),
			createdAt: Date.now(),
			files,
			contentHash,
		};
		await this._files.writeFile(
			joinPath(root, `${id}.json`),
			VSBuffer.fromString(JSON.stringify(manifest, null, 2)),
		);
		this._onDidChange.fire();
		return { id, label: manifest.label, createdAt: manifest.createdAt, fileCount: Object.keys(files).length };
	}

	async deleteSnapshot(id: string): Promise<{ ok: boolean; error?: string }> {
		const root = this._snapshotsRoot();
		if (!root) {
			return { ok: false, error: localize('quantumide.snapshot.noWorkspace', 'Open a workspace to manage snapshots.') };
		}
		try {
			await this._files.del(joinPath(root, `${id}.json`));
			this._onDidChange.fire();
			return { ok: true };
		} catch (err) {
			return { ok: false, error: String(err) };
		}
	}

	async restoreSnapshot(id: string, options?: { skipPreBackup?: boolean }): Promise<{ ok: boolean; error?: string; preBackupId?: string }> {
		const root = this._snapshotsRoot();
		const folder = this._workspace.getWorkspace().folders[0];
		if (!root || !folder) {
			return { ok: false, error: localize('quantumide.snapshot.noWorkspace', 'Open a workspace to restore snapshots.') };
		}
		let preBackupId: string | undefined;
		try {
			if (!options?.skipPreBackup) {
				const backup = await this.createSnapshot(
					localize('quantumide.snapshot.preRestore', 'Before restore ({0})', new Date().toLocaleString()),
				);
				preBackupId = backup.id;
			}
			const raw = (await this._files.readFile(joinPath(root, `${id}.json`))).value.toString();
			const m = JSON.parse(raw) as ISnapshotManifest;
			for (const [path, content] of Object.entries(m.files)) {
				const uri = joinPath(folder.uri, path);
				await this._textFiles.create([{ resource: uri, value: content, options: { overwrite: true } }]);
			}
			this._onDidChange.fire();
			return { ok: true, preBackupId };
		} catch (err) {
			const error = String(err);
			this._errors.report({
				id: generateUuid(),
				message: error,
				recoverable: true,
				retryCommand: 'quantumide.workspace.restoreSnapshot',
				retryArgs: [id],
			});
			return { ok: false, error, preBackupId };
		}
	}

	async getSnapshotDiff(id: string): Promise<IQuantumIDEWorkspaceSnapshotDiff | undefined> {
		const root = this._snapshotsRoot();
		const folder = this._workspace.getWorkspace().folders[0];
		if (!root || !folder) {
			return undefined;
		}
		try {
			const raw = (await this._files.readFile(joinPath(root, `${id}.json`))).value.toString();
			const m = JSON.parse(raw) as ISnapshotManifest;
			const changedFiles: { path: string; kind: 'modified' | 'unchanged' | 'snapshot-only' }[] = [];
			for (const [path, snapContent] of Object.entries(m.files)) {
				const uri = joinPath(folder.uri, path);
				const editorModel = this._textFiles.files.models.find(em => em.resource.toString() === uri.toString());
				const current = editorModel?.textEditorModel?.getValue();
				if (current === undefined) {
					changedFiles.push({ path, kind: 'snapshot-only' });
				} else if (current !== snapContent) {
					changedFiles.push({ path, kind: 'modified' });
				} else {
					changedFiles.push({ path, kind: 'unchanged' });
				}
			}
			const modified = changedFiles.filter(f => f.kind === 'modified').length;
			const snapshotOnly = changedFiles.filter(f => f.kind === 'snapshot-only').length;
			const summary = modified || snapshotOnly
				? localize('quantumide.snapshot.diffSummary', '{0} modified, {1} only in snapshot, {2} unchanged', modified, snapshotOnly, changedFiles.length - modified - snapshotOnly)
				: localize('quantumide.snapshot.noDiff', 'Workspace matches this snapshot.');
			return { summary, changedFiles };
		} catch {
			return undefined;
		}
	}

	async openSnapshotMultiDiff(id: string): Promise<{ ok: boolean; error?: string }> {
		const root = this._snapshotsRoot();
		const folder = this._workspace.getWorkspace().folders[0];
		if (!root || !folder) {
			return { ok: false, error: localize('quantumide.snapshot.noWorkspace', 'Open a workspace to preview snapshots.') };
		}
		try {
			const raw = (await this._files.readFile(joinPath(root, `${id}.json`))).value.toString();
			const m = JSON.parse(raw) as ISnapshotManifest;
			const edits: { path: string; content: string }[] = [];
			for (const [path, snapContent] of Object.entries(m.files)) {
				const uri = joinPath(folder.uri, path);
				const editorModel = this._textFiles.files.models.find(em => em.resource.toString() === uri.toString());
				const current = editorModel?.textEditorModel?.getValue();
				if (current !== undefined && current !== snapContent) {
					edits.push({ path, content: snapContent });
				}
			}
			if (edits.length === 0) {
				return { ok: false, error: localize('quantumide.snapshot.noDiffFiles', 'No file differences to show.') };
			}
			await this._diffReview.openProposedFileEdits(
				localize('quantumide.snapshot.multiDiffTitle', 'Snapshot: {0}', m.label),
				edits,
				folder.uri,
			);
			return { ok: true };
		} catch (err) {
			return { ok: false, error: String(err) };
		}
	}

	async gcSnapshots(keepCount = 40): Promise<{ removed: number }> {
		const snaps = await this.listSnapshots();
		const sorted = [...snaps].sort((a, b) => b.createdAt - a.createdAt);
		let removed = 0;
		for (const s of sorted.slice(keepCount)) {
			const r = await this.deleteSnapshot(s.id);
			if (r.ok) {
				removed++;
			}
		}
		return { removed };
	}

	async diffSnapshot(id: string): Promise<string | undefined> {
		const diff = await this.getSnapshotDiff(id);
		if (!diff) {
			return undefined;
		}
		const lines = [diff.summary, ...diff.changedFiles.filter(f => f.kind !== 'unchanged').map(f => `${f.kind === 'modified' ? '~' : '+'} ${f.path}`)];
		return lines.join('\n');
	}
}

registerSingleton(IQuantumIDEWorkspaceSnapshotService, QuantumIDEWorkspaceSnapshotService, InstantiationType.Delayed);
