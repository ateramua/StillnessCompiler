/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export interface IQuantumIDEOpenBufferInfo {
	readonly uri: string;
	readonly label: string;
	readonly order: number;
	readonly isActive: boolean;
	readonly isDirty: boolean;
	readonly isUntitled: boolean;
	readonly languageId?: string;
	readonly lineCount: number;
	readonly contentPreview: string;
}

export interface IQuantumIDEOpenBuffersSnapshot {
	readonly updatedAt: number;
	readonly activeUri?: string;
	readonly buffers: readonly IQuantumIDEOpenBufferInfo[];
	readonly summary: string;
}

export interface IQuantumIDEOpenBuffersService {
	readonly _serviceBrand: undefined;
	getSnapshot(maxPreviewChars?: number): IQuantumIDEOpenBuffersSnapshot;
	formatForContext(maxPreviewChars?: number): string;
}

export const IQuantumIDEOpenBuffersService = createDecorator<IQuantumIDEOpenBuffersService>('quantumIDEOpenBuffersService');
