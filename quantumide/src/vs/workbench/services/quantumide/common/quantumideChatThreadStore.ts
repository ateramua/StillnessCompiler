/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export interface IQuantumIDEChatThreadAttachment {
	readonly id: string;
	readonly kind: 'file' | 'folder' | 'selection' | 'symbol';
	readonly label: string;
}

export interface IQuantumIDEChatThreadRecord {
	readonly id: string;
	readonly sessionResource: string;
	readonly title: string;
	readonly parentThreadId?: string;
	readonly createdAt: number;
	readonly updatedAt: number;
	readonly messageCount: number;
	readonly pinned: boolean;
	readonly archived?: boolean;
	readonly chatMode?: string;
	readonly attachments?: readonly IQuantumIDEChatThreadAttachment[];
	readonly checkpointSnapshotIds?: readonly string[];
}

export interface IQuantumIDEChatThreadStoreService {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<void>;
	getThreads(): readonly IQuantumIDEChatThreadRecord[];
	search(query: string): readonly IQuantumIDEChatThreadRecord[];
	registerSession(sessionResource: URI, title: string, parentThreadId?: string): void;
	updateSession(sessionResource: URI, patch: { title?: string; messageCount?: number }): void;
	pinThread(id: string, pinned: boolean): void;
	branchThread(parentId: string, newSessionResource: URI, title: string): string;
	setThreadMode(sessionResource: URI, mode: string): void;
	setAttachments(sessionResource: URI, attachments: readonly IQuantumIDEChatThreadAttachment[]): void;
	addCheckpoint(sessionResource: URI, snapshotId: string): void;
	archiveThread(id: string, archived: boolean): void;
	exportThreadsEncrypted(passphrase: string): Promise<string>;
	importThreadsEncrypted(payload: string, passphrase: string): Promise<number>;
}

export const IQuantumIDEChatThreadStoreService = createDecorator<IQuantumIDEChatThreadStoreService>('quantumIDEChatThreadStoreService');

export const QUANTUMIDE_CHAT_THREADS_KEY = 'quantumide.chat.threads.v1';
