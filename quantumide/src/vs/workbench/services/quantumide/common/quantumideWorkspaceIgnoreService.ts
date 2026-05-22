/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import type { IQuantumIDEWorkspaceIgnorePolicy } from '../../../../platform/quantumide/common/quantumideWorkspaceIgnore.js';

export interface IQuantumIDEWorkspaceIgnoreService {
	readonly _serviceBrand: undefined;
	getPolicy(): Promise<IQuantumIDEWorkspaceIgnorePolicy>;
	isPathIgnored(relativePath: string, mode?: 'index' | 'ai' | 'all', fileName?: string): Promise<boolean>;
	invalidate(): void;
}

export const IQuantumIDEWorkspaceIgnoreService = createDecorator<IQuantumIDEWorkspaceIgnoreService>('quantumIDEWorkspaceIgnoreService');
