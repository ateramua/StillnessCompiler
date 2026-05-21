/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../base/common/async.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ISecretStorageService } from '../../../../platform/secrets/common/secrets.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { getDefaultQuantumIDETransportAdapter } from '../../../../platform/quantumide/common/quantumideTechStackAdapters.js';
import { IQuantumIDEErrorRecoveryService } from '../common/quantumideErrorRecovery.js';
import { IQuantumIDECollabRelayService, QUANTUMIDE_COLLAB_RELAY_MESSAGE } from '../common/quantumideCollabRelay.js';
import {
	IQuantumIDECollabConflictState,
	IQuantumIDECollabMessage,
	IQuantumIDECollabParticipant,
	IQuantumIDECollabPresence,
	IQuantumIDECollabSession,
	IQuantumIDECollabSessionSummary,
	IQuantumIDECollabSyncState,
	IQuantumIDECollaborationService,
	QUANTUMIDE_COLLAB_BROADCAST_CHANNEL,
	QUANTUMIDE_COLLAB_DIR,
	QUANTUMIDE_COLLAB_SECRET_KEY,
	QuantumIDECollabSyncStatus,
} from '../common/quantumideCollaboration.js';
import { decryptCollabPayload, deriveCollabCryptoKey, encryptCollabPayload } from './quantumideCollabCrypto.js';

type WriteTask = () => Promise<void>;

export class QuantumIDECollaborationService extends Disposable implements IQuantumIDECollaborationService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeSession = this._register(new Emitter<void>());
	readonly onDidChangeSession = this._onDidChangeSession.event;

	private readonly _onDidChangeSyncState = this._register(new Emitter<void>());
	readonly onDidChangeSyncState = this._onDidChangeSyncState.event;

	private readonly _participantId = generateUuid();
	private _activeSessionId: string | undefined;
	private _session: IQuantumIDECollabSession | undefined;
	private _lastKnownRevision = 0;
	private _broadcast: BroadcastChannel | undefined;
	private _cryptoKey: CryptoKey | undefined;
	private _writeQueue: WriteTask[] = [];
	private _processing = false;
	private _conflict: IQuantumIDECollabConflictState | undefined;
	private _syncState: IQuantumIDECollabSyncState = { status: 'idle', pendingWrites: 0 };
	private _online = typeof navigator !== 'undefined' ? navigator.onLine : true;
	private _offlineReplayPending = false;

	constructor(
		@IFileService private readonly _fileService: IFileService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@ISecretStorageService private readonly _secretStorage: ISecretStorageService,
		@IQuantumIDEErrorRecoveryService private readonly _errors: IQuantumIDEErrorRecoveryService,
		@IQuantumIDECollabRelayService private readonly _relay: IQuantumIDECollabRelayService,
	) {
		super();
		this._relay.setParticipantId(this._participantId);
		this._register(this._relay.onRemoteMessage(raw => { void this._handleRelayMessage(raw); }));
		if (typeof BroadcastChannel !== 'undefined') {
			this._broadcast = new BroadcastChannel(QUANTUMIDE_COLLAB_BROADCAST_CHANNEL);
			this._broadcast.onmessage = () => {
				if (this._activeSessionId) {
					void this.refreshSession();
				}
			};
		}
		this._register(getDefaultQuantumIDETransportAdapter().onMessage(msg => {
			if (msg.channel === QUANTUMIDE_COLLAB_BROADCAST_CHANNEL && this._activeSessionId) {
				void this.refreshSession();
			}
		}));
		if (typeof window !== 'undefined') {
			const onOnline = () => {
				this._online = true;
				if (this._writeQueue.length > 0 || this._syncState.status === 'offline') {
					this._offlineReplayPending = true;
				}
				this._setSyncStatus('idle');
				void this.forceSync().finally(() => { this._offlineReplayPending = false; });
			};
			const onOffline = () => {
				this._online = false;
				if (this._writeQueue.length > 0) {
					this._offlineReplayPending = true;
				}
				this._setSyncStatus('offline');
			};
			window.addEventListener('online', onOnline);
			window.addEventListener('offline', onOffline);
			this._register({ dispose: () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); } });
		}
		this._register(this._flushScheduler);
	}

	private readonly _flushScheduler = this._register(new RunOnceScheduler(() => { void this._processWriteQueue(); }, 400));

	getSyncState(): IQuantumIDECollabSyncState {
		return { ...this._syncState, conflict: this._conflict };
	}

	getActiveSession(): IQuantumIDECollabSession | undefined {
		return this._session;
	}

	getParticipantId(): string {
		return this._participantId;
	}

	async listSessions(): Promise<readonly IQuantumIDECollabSessionSummary[]> {
		const folder = this._workspaceContextService.getWorkspace().folders[0];
		if (!folder) {
			return [];
		}
		const root = joinPath(folder.uri, QUANTUMIDE_COLLAB_DIR);
		try {
			const stat = await this._fileService.resolve(root);
			if (!stat.children) {
				return [];
			}
			const out: IQuantumIDECollabSessionSummary[] = [];
			for (const child of stat.children) {
				if (!child.name.endsWith('.json')) {
					continue;
				}
				const session = await this._readSession(child.name.replace(/\.json$/, ''));
				if (session) {
					out.push({
						sessionId: session.sessionId,
						updatedAt: session.updatedAt,
						participantCount: session.participants.length,
						messageCount: session.messages.length,
					});
				}
			}
			return out.sort((a, b) => b.updatedAt - a.updatedAt);
		} catch {
			return [];
		}
	}

	async startSession(displayName: string): Promise<IQuantumIDECollabSession> {
		const sessionId = generateUuid();
		const now = Date.now();
		const session: IQuantumIDECollabSession = {
			sessionId,
			createdAt: now,
			updatedAt: now,
			revision: 1,
			participants: [{ id: this._participantId, displayName, lastSeen: now }],
			messages: [],
		};
		await this._persistSession(session);
		this._activeSessionId = sessionId;
		this._session = session;
		this._lastKnownRevision = session.revision;
		this._conflict = undefined;
		this._onDidChangeSession.fire();
		return session;
	}

	async joinSession(sessionId: string, displayName: string): Promise<IQuantumIDECollabSession | undefined> {
		const existing = await this._readSession(sessionId);
		if (!existing) {
			return undefined;
		}
		const now = Date.now();
		const participants = [...existing.participants];
		const idx = participants.findIndex(p => p.id === this._participantId);
		const entry: IQuantumIDECollabParticipant = { id: this._participantId, displayName, lastSeen: now };
		if (idx >= 0) {
			participants[idx] = entry;
		} else {
			participants.push(entry);
		}
		const session: IQuantumIDECollabSession = {
			...existing,
			participants,
			updatedAt: now,
			revision: existing.revision + 1,
		};
		await this._persistSession(session);
		this._activeSessionId = sessionId;
		this._session = session;
		this._lastKnownRevision = session.revision;
		this._conflict = undefined;
		this._onDidChangeSession.fire();
		return session;
	}

	async leaveSession(): Promise<void> {
		this._activeSessionId = undefined;
		this._session = undefined;
		this._conflict = undefined;
		this._writeQueue = [];
		this._setSyncStatus('idle');
		this._onDidChangeSession.fire();
	}

	async appendChatMessage(text: string, authorName = 'Collaborator'): Promise<IQuantumIDECollabMessage | undefined> {
		if (!this._session) {
			return undefined;
		}
		const message: IQuantumIDECollabMessage = {
			id: generateUuid(),
			authorId: this._participantId,
			authorName,
			text,
			timestamp: Date.now(),
		};
		const next: IQuantumIDECollabSession = {
			...this._session,
			updatedAt: message.timestamp,
			revision: this._session.revision + 1,
			messages: [...this._session.messages, message].slice(-200),
		};
		await this._persistSession(next);
		this._session = next;
		this._lastKnownRevision = next.revision;
		this._onDidChangeSession.fire();
		return message;
	}

	async refreshSession(): Promise<IQuantumIDECollabSession | undefined> {
		if (!this._activeSessionId) {
			return undefined;
		}
		const remote = await this._readSession(this._activeSessionId);
		if (!remote) {
			return undefined;
		}
		if (this._session && remote.revision > this._lastKnownRevision && this._syncState.status !== 'conflict') {
			if (remote.updatedAt > this._session.updatedAt && this._writeQueue.length > 0) {
				this._conflict = { local: this._session, remote };
				this._setSyncStatus('conflict');
			}
		}
		this._session = remote;
		this._lastKnownRevision = remote.revision;
		this._onDidChangeSession.fire();
		return remote;
	}

	async pulsePresence(presence?: IQuantumIDECollabPresence): Promise<void> {
		if (!this._session) {
			return;
		}
		const now = Date.now();
		const participants = this._session.participants.map(p =>
			p.id === this._participantId
				? { ...p, lastSeen: now, presence: presence ?? p.presence }
				: p,
		);
		const next: IQuantumIDECollabSession = {
			...this._session,
			participants,
			updatedAt: now,
			revision: this._session.revision + 1,
		};
		await this._persistSession(next, { skipConflictCheck: true });
		this._session = next;
		this._lastKnownRevision = next.revision;
		this._onDidChangeSession.fire();
	}

	async forceSync(): Promise<void> {
		if (!this._online) {
			this._setSyncStatus('offline');
			return;
		}
		await this._processWriteQueue();
		await this.refreshSession();
		this._setSyncStatus(this._conflict ? 'conflict' : 'idle', { lastSyncedAt: Date.now() });
	}

	async resolveConflict(strategy: 'local' | 'remote' | 'merge'): Promise<boolean> {
		if (!this._conflict || !this._activeSessionId) {
			return false;
		}
		let resolved: IQuantumIDECollabSession;
		if (strategy === 'local') {
			resolved = { ...this._conflict.local, revision: Math.max(this._conflict.local.revision, this._conflict.remote.revision) + 1 };
		} else if (strategy === 'remote') {
			resolved = { ...this._conflict.remote, revision: this._conflict.remote.revision + 1 };
		} else {
			const msgMap = new Map<string, IQuantumIDECollabMessage>();
			for (const m of [...this._conflict.remote.messages, ...this._conflict.local.messages]) {
				msgMap.set(m.id, m);
			}
			const partMap = new Map<string, IQuantumIDECollabParticipant>();
			for (const p of [...this._conflict.remote.participants, ...this._conflict.local.participants]) {
				partMap.set(p.id, p);
			}
			resolved = {
				sessionId: this._activeSessionId,
				createdAt: Math.min(this._conflict.local.createdAt, this._conflict.remote.createdAt),
				updatedAt: Date.now(),
				revision: Math.max(this._conflict.local.revision, this._conflict.remote.revision) + 1,
				participants: [...partMap.values()],
				messages: [...msgMap.values()].sort((a, b) => a.timestamp - b.timestamp).slice(-200),
			};
		}
		this._conflict = undefined;
		await this._persistSession(resolved, { skipConflictCheck: true });
		this._session = resolved;
		this._lastKnownRevision = resolved.revision;
		this._setSyncStatus('idle', { lastSyncedAt: Date.now() });
		this._onDidChangeSession.fire();
		return true;
	}

	private _enqueuePersist(session: IQuantumIDECollabSession, options?: { skipConflictCheck?: boolean }): Promise<void> {
		return new Promise((resolve, reject) => {
			this._writeQueue.push(async () => {
				try {
					await this._writeSessionNow(session, options);
					resolve();
				} catch (e) {
					reject(e);
				}
			});
			this._setSyncStatus(this._online ? 'queued' : 'offline', { pendingWrites: this._writeQueue.length });
			this._flushScheduler.schedule();
		});
	}

	private async _persistSession(session: IQuantumIDECollabSession, options?: { skipConflictCheck?: boolean }): Promise<void> {
		if (!this._online) {
			this._session = session;
			this._setSyncStatus('offline', { pendingWrites: this._writeQueue.length + 1 });
			this._writeQueue.push(async () => this._writeSessionNow(session, options));
			return;
		}
		await this._enqueuePersist(session, options);
	}

	private async _processWriteQueue(): Promise<void> {
		if (this._processing || this._conflict) {
			return;
		}
		this._processing = true;
		this._setSyncStatus('syncing');
		try {
			while (this._writeQueue.length > 0 && this._online && !this._conflict) {
				const task = this._writeQueue.shift()!;
				this._setSyncStatus('syncing', { pendingWrites: this._writeQueue.length });
				await task();
			}
			if (!this._conflict) {
				this._setSyncStatus(this._online ? 'idle' : 'offline', { lastSyncedAt: Date.now(), pendingWrites: this._writeQueue.length });
			}
		} catch (err) {
			const message = String(err);
			this._setSyncStatus('offline', { lastError: message, pendingWrites: this._writeQueue.length });
			this._errors.report({
				id: generateUuid(),
				message: localize('quantumide.collab.syncFailed', 'Collaboration sync failed.'),
				recoverable: true,
				retryCommand: 'quantumide.collab.forceSync',
			});
		} finally {
			this._processing = false;
		}
	}

	private async _writeSessionNow(session: IQuantumIDECollabSession, options?: { skipConflictCheck?: boolean }): Promise<void> {
		if (!options?.skipConflictCheck && this._activeSessionId) {
			const remote = await this._readSession(this._activeSessionId);
			if (remote && remote.revision > this._lastKnownRevision && remote.updatedAt > session.updatedAt - 50) {
				if (this._session) {
					this._conflict = { local: session, remote };
					this._setSyncStatus('conflict');
					throw new Error(localize('quantumide.collab.conflict', 'Collaboration conflict detected.'));
				}
			}
		}
		await this._writeSession(session);
		this._lastKnownRevision = session.revision;
	}

	private _setSyncStatus(status: QuantumIDECollabSyncStatus, patch?: Partial<IQuantumIDECollabSyncState>): void {
		this._syncState = {
			...this._syncState,
			status,
			pendingWrites: this._writeQueue.length,
			conflict: this._conflict,
			...patch,
		};
		this._onDidChangeSyncState.fire();
	}

	private async _ensureCryptoKey(): Promise<CryptoKey> {
		if (this._cryptoKey) {
			return this._cryptoKey;
		}
		let material = await this._secretStorage.get(QUANTUMIDE_COLLAB_SECRET_KEY);
		if (!material) {
			material = `${generateUuid()}${generateUuid()}`;
			await this._secretStorage.set(QUANTUMIDE_COLLAB_SECRET_KEY, material);
		}
		this._cryptoKey = await deriveCollabCryptoKey(material);
		return this._cryptoKey;
	}

	private _sessionUri(sessionId: string): URI | undefined {
		const folder = this._workspaceContextService.getWorkspace().folders[0];
		if (!folder) {
			return undefined;
		}
		return joinPath(folder.uri, QUANTUMIDE_COLLAB_DIR, `${sessionId}.json`);
	}

	private async _writeSession(session: IQuantumIDECollabSession): Promise<void> {
		const uri = this._sessionUri(session.sessionId);
		if (!uri) {
			return;
		}
		const folder = this._workspaceContextService.getWorkspace().folders[0];
		if (folder) {
			await this._fileService.createFolder(joinPath(folder.uri, QUANTUMIDE_COLLAB_DIR));
		}
		const key = await this._ensureCryptoKey();
		const plain = JSON.stringify(session);
		const encrypted = await encryptCollabPayload(plain, key);
		await this._fileService.writeFile(uri, VSBuffer.fromString(encrypted));
		this._relay.publish(session.sessionId, session.revision, encrypted);
		this._broadcast?.postMessage({ sessionId: session.sessionId, updatedAt: session.updatedAt, revision: session.revision });
		getDefaultQuantumIDETransportAdapter().publish({
			channel: QUANTUMIDE_COLLAB_BROADCAST_CHANNEL,
			layer: 'collab',
			payload: { sessionId: session.sessionId, updatedAt: session.updatedAt, revision: session.revision },
		});
	}

	private async _readSession(sessionId: string): Promise<IQuantumIDECollabSession | undefined> {
		const uri = this._sessionUri(sessionId);
		if (!uri) {
			return undefined;
		}
		try {
			const raw = (await this._fileService.readFile(uri)).value.toString();
			const key = await this._ensureCryptoKey();
			const plain = await decryptCollabPayload(raw, key);
			if (!plain) {
				return undefined;
			}
			const parsed = JSON.parse(plain) as IQuantumIDECollabSession;
			return {
				...parsed,
				revision: parsed.revision ?? 1,
			};
		} catch {
			return undefined;
		}
	}

	hasOfflineReplayPending(): boolean {
		return this._offlineReplayPending;
	}

	async applyOfflineReplay(): Promise<void> {
		if (!this._online) {
			return;
		}
		this._offlineReplayPending = false;
		await this.forceSync();
	}

	isLocalTransportOnly(): boolean {
		return !this._relay.getState().connected;
	}

	async connectRelay(url: string): Promise<void> {
		this._relay.setParticipantId(this._participantId);
		await this._relay.connect(url);
	}

	disconnectRelay(): void {
		this._relay.disconnect();
	}

	getRelayUrl(): string | undefined {
		return this._relay.getState().url;
	}

	private async _handleRelayMessage(raw: string): Promise<void> {
		try {
			const msg = JSON.parse(raw) as { type?: string; sessionId?: string; revision?: number; payload?: string; participantId?: string };
			if (msg.type !== QUANTUMIDE_COLLAB_RELAY_MESSAGE || !msg.sessionId || !msg.payload || msg.participantId === this._participantId) {
				return;
			}
			if (this._activeSessionId && msg.sessionId !== this._activeSessionId) {
				return;
			}
			const key = await this._ensureCryptoKey();
			const plain = await decryptCollabPayload(msg.payload, key);
			if (!plain) {
				return;
			}
			const remote = JSON.parse(plain) as IQuantumIDECollabSession;
			if (this._session && remote.revision > this._session.revision) {
				this._session = remote;
				this._lastKnownRevision = remote.revision;
				this._onDidChangeSession.fire();
			}
		} catch {
			// ignore malformed relay frames
		}
	}
}

registerSingleton(IQuantumIDECollaborationService, QuantumIDECollaborationService, InstantiationType.Delayed);

// Re-export for legacy imports
export {
	QUANTUMIDE_COLLAB_BROADCAST_CHANNEL,
	QUANTUMIDE_COLLAB_DIR,
} from '../common/quantumideCollaboration.js';
