/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export type QuantumIDEChatCardKind = 'code' | 'error' | 'test' | 'scm' | 'context' | 'info';

export interface IQuantumIDEChatContextCard {
	readonly id: string;
	readonly threadId: string;
	readonly kind: QuantumIDEChatCardKind;
	readonly title: string;
	readonly body: string;
	readonly createdAt: number;
	readonly pinned: boolean;
	readonly command?: string;
	readonly commandArgs?: readonly unknown[];
}

export interface IQuantumIDEChatRichUiService {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<void>;
	getThreads(): readonly { id: string; title: string; updatedAt: number }[];
	getCards(threadId?: string): readonly IQuantumIDEChatContextCard[];
	addCard(card: Omit<IQuantumIDEChatContextCard, 'id' | 'createdAt'>): string;
	pinCard(id: string, pinned: boolean): void;
	removeCard(id: string): void;
	searchCards(query: string): readonly IQuantumIDEChatContextCard[];
}

export const IQuantumIDEChatRichUiService = createDecorator<IQuantumIDEChatRichUiService>('quantumIDEChatRichUiService');

export const QUANTUMIDE_CHAT_CARDS_KEY = 'quantumide.chat.contextCards';
