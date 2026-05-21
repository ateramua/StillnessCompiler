/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export interface IQuantumIDEContextInspectorSection {
	readonly id: string;
	readonly title: string;
	readonly charCount: number;
	readonly omitted: boolean;
	readonly tokenEstimate?: number;
	readonly ageMs?: number;
	readonly stale?: boolean;
	readonly error?: string;
}

export interface IQuantumIDEContextInspectorService {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<void>;
	getSections(): readonly IQuantumIDEContextInspectorSection[];
	getLastBuiltAt(): number | undefined;
	recordBuild(sections: readonly IQuantumIDEContextInspectorSection[]): void;
	clear(): void;
}

export const IQuantumIDEContextInspectorService = createDecorator<IQuantumIDEContextInspectorService>('quantumIDEContextInspectorService');
