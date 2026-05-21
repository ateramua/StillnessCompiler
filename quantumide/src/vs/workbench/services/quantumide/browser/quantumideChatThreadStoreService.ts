/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { decodeBase64, encodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import {
	IQuantumIDEChatThreadRecord,
	IQuantumIDEChatThreadStoreService,
	QUANTUMIDE_CHAT_THREADS_KEY,
} from '../common/quantumideChatThreadStore.js';
import { decryptCollabPayload, deriveCollabCryptoKey, encryptCollabPayload } from './quantumideCollabCrypto.js';

export class QuantumIDEChatThreadStoreService extends Disposable implements IQuantumIDEChatThreadStoreService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private _threads: IQuantumIDEChatThreadRecord[] = [];

	constructor(
		@IStorageService private readonly _storage: IStorageService,
	) {
		super();
		this._threads = this._read();
	}

	getThreads(): readonly IQuantumIDEChatThreadRecord[] {
		return [...this._threads].sort((a, b) => b.updatedAt - a.updatedAt);
	}

	search(query: string): readonly IQuantumIDEChatThreadRecord[] {
		const q = query.trim().toLowerCase();
		if (!q) {
			return this.getThreads();
		}
		return this.getThreads().filter(t =>
			t.title.toLowerCase().includes(q) || t.sessionResource.toLowerCase().includes(q),
		);
	}

	registerSession(sessionResource: URI, title: string, parentThreadId?: string): void {
		const key = sessionResource.toString();
		const existing = this._threads.find(t => t.sessionResource === key);
		if (existing) {
			this.updateSession(sessionResource, { title });
			return;
		}
		const now = Date.now();
		this._threads = [{
			id: generateUuid(),
			sessionResource: key,
			title,
			parentThreadId,
			createdAt: now,
			updatedAt: now,
			messageCount: 0,
			pinned: false,
		}, ...this._threads].slice(0, 500);
		this._persist();
	}

	updateSession(sessionResource: URI, patch: { title?: string; messageCount?: number }): void {
		const key = sessionResource.toString();
		this._threads = this._threads.map(t =>
			t.sessionResource === key
				? {
					...t,
					title: patch.title ?? t.title,
					messageCount: patch.messageCount ?? t.messageCount,
					updatedAt: Date.now(),
				}
				: t,
		);
		this._persist();
	}

	pinThread(id: string, pinned: boolean): void {
		this._threads = this._threads.map(t => t.id === id ? { ...t, pinned } : t);
		this._persist();
	}

	branchThread(parentId: string, newSessionResource: URI, title: string): string {
		const parent = this._threads.find(t => t.id === parentId);
		this.registerSession(newSessionResource, title, parentId);
		return parent?.sessionResource ?? newSessionResource.toString();
	}

	setThreadMode(sessionResource: URI, mode: string): void {
		const key = sessionResource.toString();
		this._threads = this._threads.map(t =>
			t.sessionResource === key ? { ...t, chatMode: mode, updatedAt: Date.now() } : t,
		);
		this._persist();
	}

	setAttachments(sessionResource: URI, attachments: import('../common/quantumideChatThreadStore.js').IQuantumIDEChatThreadAttachment[]): void {
		const key = sessionResource.toString();
		this._threads = this._threads.map(t =>
			t.sessionResource === key ? { ...t, attachments: [...attachments], updatedAt: Date.now() } : t,
		);
		this._persist();
	}

	addCheckpoint(sessionResource: URI, snapshotId: string): void {
		const key = sessionResource.toString();
		this._threads = this._threads.map(t => {
			if (t.sessionResource !== key) {
				return t;
			}
			const ids = [...(t.checkpointSnapshotIds ?? []), snapshotId].slice(-20);
			return { ...t, checkpointSnapshotIds: ids, updatedAt: Date.now() };
		});
		this._persist();
	}

	archiveThread(id: string, archived: boolean): void {
		this._threads = this._threads.map(t => t.id === id ? { ...t, archived, updatedAt: Date.now() } : t);
		this._persist();
	}

	async exportThreadsEncrypted(passphrase: string): Promise<string> {
		const plain = JSON.stringify({ version: 1, threads: this._threads });
		if (typeof globalThis.crypto?.subtle === 'undefined') {
			return `qexp1:${encodeBase64(VSBuffer.fromString(plain))}`;
		}
		const key = await deriveCollabCryptoKey(passphrase.padEnd(32, '0').slice(0, 64));
		return await encryptCollabPayload(plain, key);
	}

	async importThreadsEncrypted(payload: string, passphrase: string): Promise<number> {
		let plain: string;
		if (payload.startsWith('qexp1:')) {
			plain = decodeBase64(payload.slice(6)).toString();
		} else if (typeof globalThis.crypto?.subtle !== 'undefined') {
			const key = await deriveCollabCryptoKey(passphrase.padEnd(32, '0').slice(0, 64));
			plain = (await decryptCollabPayload(payload, key)) ?? '';
		} else {
			return 0;
		}
		try {
			const data = JSON.parse(plain) as { threads?: IQuantumIDEChatThreadRecord[] };
			if (!Array.isArray(data.threads)) {
				return 0;
			}
			this._threads = data.threads;
			this._persist();
			return data.threads.length;
		} catch {
			return 0;
		}
	}

	private _read(): IQuantumIDEChatThreadRecord[] {
		try {
			const raw = this._storage.get(QUANTUMIDE_CHAT_THREADS_KEY, StorageScope.WORKSPACE);
			if (!raw) {
				return [];
			}
			return JSON.parse(raw) as IQuantumIDEChatThreadRecord[];
		} catch {
			return [];
		}
	}

	private _persist(): void {
		this._storage.store(QUANTUMIDE_CHAT_THREADS_KEY, JSON.stringify(this._threads), StorageScope.WORKSPACE, StorageTarget.USER);
		this._onDidChange.fire();
	}
}

registerSingleton(IQuantumIDEChatThreadStoreService, QuantumIDEChatThreadStoreService, InstantiationType.Delayed);
