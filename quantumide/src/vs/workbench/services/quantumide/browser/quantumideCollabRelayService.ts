/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import {
	IQuantumIDECollabRelayService,
	IQuantumIDECollabRelayState,
	QUANTUMIDE_COLLAB_RELAY_MESSAGE,
} from '../common/quantumideCollabRelay.js';

interface IRelayEnvelope {
	readonly type: typeof QUANTUMIDE_COLLAB_RELAY_MESSAGE;
	readonly sessionId: string;
	readonly revision: number;
	readonly payload: string;
	readonly participantId: string;
}

export class QuantumIDECollabRelayService extends Disposable implements IQuantumIDECollabRelayService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;
	private readonly _onRemoteMessage = this._register(new Emitter<string>());
	readonly onRemoteMessage = this._onRemoteMessage.event;

	private _socket: WebSocket | undefined;
	private _url: string | undefined;
	private _lastError: string | undefined;
	private _messagesReceived = 0;
	private _participantId = '';

	setParticipantId(id: string): void {
		this._participantId = id;
	}

	getState(): IQuantumIDECollabRelayState {
		return {
			connected: this._socket?.readyState === WebSocket.OPEN,
			url: this._url,
			lastError: this._lastError,
			messagesReceived: this._messagesReceived,
		};
	}

	async connect(url: string): Promise<void> {
		this.disconnect();
		this._url = url;
		this._lastError = undefined;
		if (typeof WebSocket === 'undefined') {
			this._lastError = 'WebSocket unavailable';
			this._onDidChange.fire();
			throw new Error(this._lastError);
		}
		return new Promise((resolve, reject) => {
			const socket = new WebSocket(url);
			this._socket = socket;
			socket.onopen = () => {
				this._onDidChange.fire();
				resolve();
			};
			socket.onerror = () => {
				this._lastError = 'WebSocket connection failed';
				this._onDidChange.fire();
				reject(new Error(this._lastError));
			};
			socket.onclose = () => {
				this._onDidChange.fire();
			};
			socket.onmessage = (ev) => {
				this._messagesReceived++;
				this._onDidChange.fire();
				if (typeof ev.data === 'string') {
					this._onRemoteMessage.fire(ev.data);
				}
			};
		});
	}

	disconnect(): void {
		if (this._socket) {
			try {
				this._socket.close();
			} catch {
				// ignore
			}
			this._socket = undefined;
		}
		this._onDidChange.fire();
	}

	publish(sessionId: string, revision: number, encryptedPayload: string): void {
		if (this._socket?.readyState !== WebSocket.OPEN) {
			return;
		}
		const msg: IRelayEnvelope = {
			type: QUANTUMIDE_COLLAB_RELAY_MESSAGE,
			sessionId,
			revision,
			payload: encryptedPayload,
			participantId: this._participantId,
		};
		this._socket.send(JSON.stringify(msg));
	}
}

registerSingleton(IQuantumIDECollabRelayService, QuantumIDECollabRelayService, InstantiationType.Delayed);
