/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export interface IQuantumIDEOfflineState {
	readonly online: boolean;
	readonly since: number;
}

export interface IQuantumIDEOfflineService {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<IQuantumIDEOfflineState>;
	getState(): IQuantumIDEOfflineState;
}

export const IQuantumIDEOfflineService = createDecorator<IQuantumIDEOfflineService>('quantumIDEOfflineService');

export interface IQuantumIDETelemetryEvent {
	readonly name: string;
	readonly at: number;
	readonly properties?: Record<string, string | number | boolean>;
}

export interface IQuantumIDETelemetryService {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<void>;
	isEnabled(): boolean;
	setEnabled(enabled: boolean): void;
	record(name: string, properties?: Record<string, string | number | boolean>): void;
	getRecent(limit?: number): readonly IQuantumIDETelemetryEvent[];
	exportJson(): string;
}

export const IQuantumIDETelemetryService = createDecorator<IQuantumIDETelemetryService>('quantumIDETelemetryService');

export interface IQuantumIDEUnifiedSearchHit {
	readonly path: string;
	readonly line?: number;
	readonly label: string;
	readonly detail: string;
	readonly kind: 'semantic' | 'symbol' | 'file';
	readonly score: number;
	readonly signature?: string;
}

export interface IQuantumIDEUnifiedSearchService {
	readonly _serviceBrand: undefined;
	search(query: string, maxResults?: number): Promise<readonly IQuantumIDEUnifiedSearchHit[]>;
}

export const IQuantumIDEUnifiedSearchService = createDecorator<IQuantumIDEUnifiedSearchService>('quantumIDEUnifiedSearchService');

export interface IQuantumIDEInlinePrefetchService {
	readonly _serviceBrand: undefined;
	getCached(uri: string, selectionKey: string): string | undefined;
	setCached(uri: string, selectionKey: string, suggestion: string): void;
}

export const IQuantumIDEInlinePrefetchService = createDecorator<IQuantumIDEInlinePrefetchService>('quantumIDEInlinePrefetchService');
