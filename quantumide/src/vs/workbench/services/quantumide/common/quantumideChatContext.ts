/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import type { IQuantumIDEWorkspaceContextBuildOptions } from './quantumideWorkspaceContext.js';

export interface IQuantumIDEChatContextBuildOptions extends IQuantumIDEWorkspaceContextBuildOptions {
	readonly includeOpenTabs?: boolean;
	readonly includeTerminal?: boolean;
	readonly includeBranch?: boolean;
	readonly includeNavigationHistory?: boolean;
	readonly userQuery?: string;
}

export interface IQuantumIDEChatContextOrchestrator {
	readonly _serviceBrand: undefined;
	readonly onDidChangeContext: Event<void>;
	buildChatContext(options?: IQuantumIDEChatContextBuildOptions): Promise<string>;
}

export const IQuantumIDEChatContextOrchestrator = createDecorator<IQuantumIDEChatContextOrchestrator>('quantumIDEChatContextOrchestrator');
