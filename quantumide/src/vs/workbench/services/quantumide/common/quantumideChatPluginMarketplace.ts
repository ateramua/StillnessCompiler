/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export interface IQuantumIDEChatPluginListing {
	readonly id: string;
	readonly name: string;
	readonly description: string;
	readonly enabled: boolean;
	readonly source: 'quantumide' | 'vscode-extension';
	readonly toolCount: number;
	readonly installCommand?: string;
}

export interface IQuantumIDEChatPluginMarketplaceService {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<void>;
	search(query: string): readonly IQuantumIDEChatPluginListing[];
	getInstalled(): readonly IQuantumIDEChatPluginListing[];
	setEnabled(pluginId: string, enabled: boolean): void;
	refresh(): void;
}

export const IQuantumIDEChatPluginMarketplaceService = createDecorator<IQuantumIDEChatPluginMarketplaceService>('quantumIDEChatPluginMarketplaceService');
