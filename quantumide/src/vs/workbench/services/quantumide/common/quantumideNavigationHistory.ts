/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export interface IQuantumIDENavigationHistoryEntry {
	readonly resource: string;
	readonly line?: number;
	readonly kind: 'editor' | 'definition' | 'reference' | 'tab';
	readonly at: number;
}

export interface IQuantumIDENavigationHistoryService {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<void>;
	getRecent(limit?: number): readonly IQuantumIDENavigationHistoryEntry[];
	record(entry: Omit<IQuantumIDENavigationHistoryEntry, 'at'>): void;
	formatForContext(maxEntries?: number): string;
}

export const IQuantumIDENavigationHistoryService = createDecorator<IQuantumIDENavigationHistoryService>('quantumIDENavigationHistoryService');
