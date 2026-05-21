/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export interface IQuantumIDEWorkspaceSnapshotMeta {
	readonly id: string;
	readonly label: string;
	readonly createdAt: number;
	readonly fileCount: number;
}

export type QuantumIDEWorkspaceSnapshotFileChangeKind = 'modified' | 'unchanged' | 'snapshot-only';

export interface IQuantumIDEWorkspaceSnapshotFileChange {
	readonly path: string;
	readonly kind: QuantumIDEWorkspaceSnapshotFileChangeKind;
}

export interface IQuantumIDEWorkspaceSnapshotDiff {
	readonly summary: string;
	readonly changedFiles: readonly IQuantumIDEWorkspaceSnapshotFileChange[];
}

export interface IQuantumIDEWorkspaceTimelineEntry {
	readonly kind: 'code-snapshot' | 'workspace-session';
	readonly id: string;
	readonly label: string;
	readonly createdAt: number;
	readonly fileCount: number;
	readonly savedAt?: number;
}

export interface IQuantumIDEWorkspaceSnapshotService {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<void>;
	listSnapshots(): Promise<readonly IQuantumIDEWorkspaceSnapshotMeta[]>;
	listTimeline(): Promise<readonly IQuantumIDEWorkspaceTimelineEntry[]>;
	createSnapshot(label?: string): Promise<IQuantumIDEWorkspaceSnapshotMeta>;
	restoreSnapshot(id: string, options?: { skipPreBackup?: boolean }): Promise<{ ok: boolean; error?: string; preBackupId?: string }>;
	deleteSnapshot(id: string): Promise<{ ok: boolean; error?: string }>;
	getSnapshotDiff(id: string): Promise<IQuantumIDEWorkspaceSnapshotDiff | undefined>;
	openSnapshotMultiDiff(id: string): Promise<{ ok: boolean; error?: string }>;
	gcSnapshots(keepCount?: number): Promise<{ removed: number }>;
	/** @deprecated use getSnapshotDiff */
	diffSnapshot(id: string): Promise<string | undefined>;
}

export const IQuantumIDEWorkspaceSnapshotService = createDecorator<IQuantumIDEWorkspaceSnapshotService>('quantumIDEWorkspaceSnapshotService');

export const QUANTUMIDE_SNAPSHOTS_DIR = '.quantumide/snapshots';
