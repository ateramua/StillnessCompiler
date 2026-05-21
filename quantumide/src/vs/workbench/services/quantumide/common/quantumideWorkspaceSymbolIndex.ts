/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import type { IQuantumIDEAstSymbolEntry } from '../../../../platform/quantumide/common/quantumideSemanticIndex.js';

export interface IQuantumIDEWorkspaceSymbolIndexService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeIndex: Event<void>;
	getSymbols(): readonly IQuantumIDEAstSymbolEntry[];
	searchSymbols(query: string, maxResults?: number): readonly IQuantumIDEAstSymbolEntry[];
	refreshWorkspaceSymbols(symbols: readonly IQuantumIDEAstSymbolEntry[]): Promise<void>;
	updateFileSymbols(path: string, text: string): void;
}

export const IQuantumIDEWorkspaceSymbolIndexService = createDecorator<IQuantumIDEWorkspaceSymbolIndexService>('quantumIDEWorkspaceSymbolIndexService');
