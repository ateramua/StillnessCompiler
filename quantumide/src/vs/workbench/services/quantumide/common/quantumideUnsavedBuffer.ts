/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { URI } from '../../../../base/common/uri.js';

export interface IQuantumIDEUnsavedBufferReadResult {
	readonly uri: string;
	readonly content: string;
	readonly isDirty: boolean;
	readonly lineCount: number;
}

export interface IQuantumIDEUnsavedBufferWriteResult {
	readonly success: boolean;
	readonly message: string;
	readonly uri?: string;
}

export interface IQuantumIDEUnsavedBufferService {
	readonly _serviceBrand: undefined;
	readBuffer(resource: URI | string): Promise<IQuantumIDEUnsavedBufferReadResult | undefined>;
	writeBuffer(resource: URI | string, content: string, createUndo?: boolean): Promise<IQuantumIDEUnsavedBufferWriteResult>;
	applyPartialEdit(resource: URI | string, startLine: number, startColumn: number, endLine: number, endColumn: number, text: string): Promise<IQuantumIDEUnsavedBufferWriteResult>;
}

export const IQuantumIDEUnsavedBufferService = createDecorator<IQuantumIDEUnsavedBufferService>('quantumIDEUnsavedBufferService');
