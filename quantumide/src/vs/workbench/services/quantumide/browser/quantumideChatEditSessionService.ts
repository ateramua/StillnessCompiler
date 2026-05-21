/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { applyQuantumIDEWorkspaceEdits } from '../../../../platform/quantumide/common/quantumideWorkspaceEdits.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IQuantumIDEChatInlineEditService } from './quantumideChatInlineEditService.js';
import { IQuantumIDEWorkspaceSnapshotService } from '../common/quantumideWorkspaceSnapshot.js';

export interface IQuantumIDEChatEditSessionSnapshot {
	readonly paths: readonly string[];
	readonly originals: ReadonlyMap<string, string>;
}

export interface IQuantumIDEChatEditSessionService {
	readonly _serviceBrand: undefined;
	readonly onDidChange: import('../../../../base/common/event.js').Event<void>;
	stageFromProposedEdits(edits: readonly { path: string; content: string; resourceUri?: string }[], label?: string): Promise<void>;
	acceptAll(): Promise<{ applied: number; errors: string[] }>;
	acceptBatch(batchId: string): Promise<number>;
	rejectBatch(batchId: string): void;
	acceptEditById(id: string): Promise<boolean>;
	rejectEditById(id: string): void;
	getBatchIds(): readonly string[];
	getPendingEditsForBatch(batchId: string): readonly import('./quantumideChatInlineEditService.js').IQuantumIDEChatPendingEdit[];
	rejectAll(): void;
	rollbackLastBatch(): Promise<boolean>;
	getPendingCount(): number;
}

export const IQuantumIDEChatEditSessionService = createDecorator<IQuantumIDEChatEditSessionService>('quantumIDEChatEditSessionService');

export class QuantumIDEChatEditSessionService extends Disposable implements IQuantumIDEChatEditSessionService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private _lastBatch: IQuantumIDEChatEditSessionSnapshot | undefined;

	constructor(
		@IQuantumIDEChatInlineEditService private readonly _inlineEdits: IQuantumIDEChatInlineEditService,
		@IFileService private readonly _fileService: IFileService,
		@IWorkspaceContextService private readonly _workspace: IWorkspaceContextService,
		@IQuantumIDEWorkspaceSnapshotService private readonly _snapshots: IQuantumIDEWorkspaceSnapshotService,
	) {
		super();
		this._register(this._inlineEdits.onDidChangePending(() => this._onDidChange.fire()));
	}

	async stageFromProposedEdits(edits: readonly { path: string; content: string; resourceUri?: string }[], label = 'Agent proposed edits'): Promise<void> {
		const root = this._workspace.getWorkspace().folders[0]?.uri;
		if (edits.length === 0) {
			return;
		}
		const originals = new Map<string, string>();
		for (const edit of edits) {
			const target = edit.resourceUri ? URI.parse(edit.resourceUri) : (root ? URI.joinPath(root, edit.path.replace(/\\/g, '/').replace(/^\.\//, '')) : undefined);
			if (!target) {
				continue;
			}
			try {
				originals.set(edit.path, (await this._fileService.readFile(target)).value.toString());
			} catch {
				originals.set(edit.path, '');
			}
		}
		this._lastBatch = { paths: edits.map(e => e.path), originals };
		void this._snapshots.createSnapshot(label).catch(() => { /* best-effort auto-backup */ });
		await this._inlineEdits.stageEdits(edits);
	}

	async acceptAll(): Promise<{ applied: number; errors: string[] }> {
		const count = await this._inlineEdits.acceptAll();
		const errors: string[] = [];
		if (count < this.getPendingCount()) {
			errors.push('Some edits failed to apply.');
		}
		this._onDidChange.fire();
		return { applied: count, errors };
	}

	async acceptBatch(batchId: string): Promise<number> {
		const count = await this._inlineEdits.acceptBatch(batchId);
		this._onDidChange.fire();
		return count;
	}

	rejectBatch(batchId: string): void {
		this._inlineEdits.rejectBatch(batchId);
		this._onDidChange.fire();
	}

	async acceptEditById(id: string): Promise<boolean> {
		const ok = await this._inlineEdits.acceptEdit(id);
		this._onDidChange.fire();
		return ok;
	}

	rejectEditById(id: string): void {
		this._inlineEdits.rejectEdit(id);
		this._onDidChange.fire();
	}

	getBatchIds(): readonly string[] {
		return this._inlineEdits.getBatchIds();
	}

	getPendingEditsForBatch(batchId: string): readonly import('./quantumideChatInlineEditService.js').IQuantumIDEChatPendingEdit[] {
		return this._inlineEdits.getPendingEditsForBatch(batchId);
	}

	rejectAll(): void {
		this._inlineEdits.rejectAll();
		this._lastBatch = undefined;
		this._onDidChange.fire();
	}

	async rollbackLastBatch(): Promise<boolean> {
		const batch = this._lastBatch;
		const root = this._workspace.getWorkspace().folders[0]?.uri;
		if (!batch || !root) {
			return false;
		}
		const edits = [...batch.originals.entries()].map(([path, content]) => ({
			operation: 'write' as const,
			path,
			content,
		}));
		const result = await applyQuantumIDEWorkspaceEdits(this._fileService, root, edits, {
			workingDirectory: root,
			atomic: true,
			validateSyntax: false,
		});
		this._lastBatch = undefined;
		this._inlineEdits.rejectAll();
		this._onDidChange.fire();
		return result.errors.length === 0;
	}

	getPendingCount(): number {
		return this._inlineEdits.getPendingEdits().length;
	}
}

registerSingleton(IQuantumIDEChatEditSessionService, QuantumIDEChatEditSessionService, InstantiationType.Delayed);
