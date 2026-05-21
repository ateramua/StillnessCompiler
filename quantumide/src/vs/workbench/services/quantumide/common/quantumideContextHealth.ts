/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export type QuantumIDEContextHealthState = 'healthy' | 'degraded' | 'unavailable';

export interface IQuantumIDEContextHealthSnapshot {
	readonly state: QuantumIDEContextHealthState;
	readonly lastBuiltAt: number | undefined;
	readonly lastError: string | undefined;
	readonly sectionCount: number;
	readonly omittedSectionCount: number;
	readonly includesUnsavedBuffers: boolean;
}

export interface IQuantumIDEContextHealthService {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<void>;
	getSnapshot(): IQuantumIDEContextHealthSnapshot;
	recordSuccess(sectionCount: number, omittedCount: number, includesUnsaved: boolean): void;
	recordFailure(error: string): void;
	reloadContext(options?: { userQuery?: string }): Promise<string>;
}

export const IQuantumIDEContextHealthService = createDecorator<IQuantumIDEContextHealthService>('quantumIDEContextHealthService');
