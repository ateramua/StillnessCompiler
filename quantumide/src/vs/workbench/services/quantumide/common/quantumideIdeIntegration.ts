/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export interface IQuantumIDEIdeIntegrationResult {
	readonly success: boolean;
	readonly message: string;
}

export interface IQuantumIDEIdeIntegrationService {
	readonly _serviceBrand: undefined;
	executeCommand(commandId: string, args?: unknown): Promise<IQuantumIDEIdeIntegrationResult>;
	updateSetting(key: string, value: unknown, scope?: 'user' | 'workspace'): Promise<IQuantumIDEIdeIntegrationResult>;
	listExtensions(query?: string): Promise<readonly { id: string; enabled: boolean }[]>;
	setExtensionEnabled(extensionId: string, enabled: boolean): Promise<IQuantumIDEIdeIntegrationResult>;
	installExtension(extensionId: string, enable?: boolean): Promise<IQuantumIDEIdeIntegrationResult>;
	runLspAction(action: 'rename' | 'format' | 'organizeImports' | 'quickFix' | 'refactor'): Promise<IQuantumIDEIdeIntegrationResult>;
}

export const IQuantumIDEIdeIntegrationService = createDecorator<IQuantumIDEIdeIntegrationService>('quantumIDEIdeIntegrationService');
