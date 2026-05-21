/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const QUANTUMIDE_COLLAB_BROADCAST_CHANNEL = 'quantumide-collab-sync';
export const QUANTUMIDE_COLLAB_DIR = '.quantumide/collab';
export const QUANTUMIDE_COLLAB_SECRET_KEY = 'quantumide.collab.encryptionKey';
export const COLLAB_PRESENCE_STALE_MS = 90_000;

export type QuantumIDECollabSyncStatus = 'idle' | 'syncing' | 'queued' | 'offline' | 'conflict';

export interface IQuantumIDECollabPresence {
	readonly resource?: string;
	readonly line?: number;
	readonly column?: number;
}

export interface IQuantumIDECollabParticipant {
	readonly id: string;
	readonly displayName: string;
	readonly lastSeen: number;
	readonly presence?: IQuantumIDECollabPresence;
}

export interface IQuantumIDECollabMessage {
	readonly id: string;
	readonly authorId: string;
	readonly authorName: string;
	readonly text: string;
	readonly timestamp: number;
}

export interface IQuantumIDECollabSession {
	readonly sessionId: string;
	readonly createdAt: number;
	readonly updatedAt: number;
	readonly revision: number;
	readonly participants: readonly IQuantumIDECollabParticipant[];
	readonly messages: readonly IQuantumIDECollabMessage[];
}

export interface IQuantumIDECollabConflictState {
	readonly local: IQuantumIDECollabSession;
	readonly remote: IQuantumIDECollabSession;
}

export interface IQuantumIDECollabSyncState {
	readonly status: QuantumIDECollabSyncStatus;
	readonly pendingWrites: number;
	readonly lastSyncedAt?: number;
	readonly lastError?: string;
	readonly conflict?: IQuantumIDECollabConflictState;
}

export interface IQuantumIDECollabSessionSummary {
	readonly sessionId: string;
	readonly updatedAt: number;
	readonly participantCount: number;
	readonly messageCount: number;
}

export interface IQuantumIDECollaborationService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeSession: Event<void>;
	readonly onDidChangeSyncState: Event<void>;
	getSyncState(): IQuantumIDECollabSyncState;
	getActiveSession(): IQuantumIDECollabSession | undefined;
	getParticipantId(): string;
	listSessions(): Promise<readonly IQuantumIDECollabSessionSummary[]>;
	startSession(displayName: string): Promise<IQuantumIDECollabSession>;
	joinSession(sessionId: string, displayName: string): Promise<IQuantumIDECollabSession | undefined>;
	leaveSession(): Promise<void>;
	appendChatMessage(text: string, authorName?: string): Promise<IQuantumIDECollabMessage | undefined>;
	refreshSession(): Promise<IQuantumIDECollabSession | undefined>;
	pulsePresence(presence?: IQuantumIDECollabPresence): Promise<void>;
	forceSync(): Promise<void>;
	resolveConflict(strategy: 'local' | 'remote' | 'merge'): Promise<boolean>;
	hasOfflineReplayPending(): boolean;
	applyOfflineReplay(): Promise<void>;
	isLocalTransportOnly(): boolean;
	connectRelay(url: string): Promise<void>;
	disconnectRelay(): void;
	getRelayUrl(): string | undefined;
}

export const IQuantumIDECollaborationService = createDecorator<IQuantumIDECollaborationService>('quantumIDECollaborationService');
