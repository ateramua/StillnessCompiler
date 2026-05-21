/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import {
	IQuantumIDEChatContextCard,
	IQuantumIDEChatRichUiService,
	QUANTUMIDE_CHAT_CARDS_KEY,
} from '../common/quantumideChatRichUi.js';

interface IStoredCards {
	readonly threads: { id: string; title: string; updatedAt: number }[];
	readonly cards: IQuantumIDEChatContextCard[];
}

export class QuantumIDEChatRichUiService extends Disposable implements IQuantumIDEChatRichUiService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private _data: IStoredCards = { threads: [], cards: [] };

	constructor(
		@IStorageService private readonly _storage: IStorageService,
	) {
		super();
		this._data = this._read();
	}

	getThreads(): readonly { id: string; title: string; updatedAt: number }[] {
		return this._data.threads.sort((a, b) => b.updatedAt - a.updatedAt);
	}

	getCards(threadId?: string): readonly IQuantumIDEChatContextCard[] {
		const cards = threadId
			? this._data.cards.filter(c => c.threadId === threadId)
			: this._data.cards;
		return cards.sort((a, b) => b.createdAt - a.createdAt);
	}

	searchCards(query: string): readonly IQuantumIDEChatContextCard[] {
		const q = query.trim().toLowerCase();
		if (!q) {
			return this.getCards();
		}
		return this.getCards().filter(c =>
			c.title.toLowerCase().includes(q) || c.body.toLowerCase().includes(q),
		);
	}

	addCard(card: Omit<IQuantumIDEChatContextCard, 'id' | 'createdAt'>): string {
		const id = generateUuid();
		const full: IQuantumIDEChatContextCard = { ...card, id, createdAt: Date.now() };
		let threads = [...this._data.threads];
		if (threads.some(t => t.id === card.threadId)) {
			threads = threads.map(t => t.id === card.threadId ? { ...t, updatedAt: Date.now() } : t);
		} else {
			threads.push({ id: card.threadId, title: card.threadId, updatedAt: Date.now() });
		}
		this._data = {
			threads,
			cards: [full, ...this._data.cards].slice(0, 500),
		};
		this._persist();
		return id;
	}

	pinCard(id: string, pinned: boolean): void {
		this._data = {
			...this._data,
			cards: this._data.cards.map(c => c.id === id ? { ...c, pinned } : c),
		};
		this._persist();
	}

	removeCard(id: string): void {
		this._data = {
			...this._data,
			cards: this._data.cards.filter(c => c.id !== id),
		};
		this._persist();
	}

	private _read(): IStoredCards {
		try {
			const raw = this._storage.get(QUANTUMIDE_CHAT_CARDS_KEY, StorageScope.WORKSPACE);
			if (!raw) {
				return { threads: [], cards: [] };
			}
			return JSON.parse(raw) as IStoredCards;
		} catch {
			return { threads: [], cards: [] };
		}
	}

	private _persist(): void {
		this._storage.store(QUANTUMIDE_CHAT_CARDS_KEY, JSON.stringify(this._data), StorageScope.WORKSPACE, StorageTarget.USER);
		this._onDidChange.fire();
	}
}

registerSingleton(IQuantumIDEChatRichUiService, QuantumIDEChatRichUiService, InstantiationType.Delayed);
