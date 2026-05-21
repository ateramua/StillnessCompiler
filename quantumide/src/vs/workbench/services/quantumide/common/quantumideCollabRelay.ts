/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export interface IQuantumIDECollabRelayState {
	readonly connected: boolean;
	readonly url?: string;
	readonly lastError?: string;
	readonly messagesReceived: number;
}

export interface IQuantumIDECollabRelayService {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<void>;
	readonly onRemoteMessage: Event<string>;
	getState(): IQuantumIDECollabRelayState;
	setParticipantId(id: string): void;
	connect(url: string): Promise<void>;
	disconnect(): void;
	publish(sessionId: string, revision: number, encryptedPayload: string): void;
}

export const IQuantumIDECollabRelayService = createDecorator<IQuantumIDECollabRelayService>('quantumIDECollabRelayService');

export const QUANTUMIDE_COLLAB_RELAY_MESSAGE = 'quantumide-collab-relay-v1';
