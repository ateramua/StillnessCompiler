/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export type QuantumIDEChatTestState = 'running' | 'passed' | 'failed' | 'skipped' | 'queued';

export interface IQuantumIDEChatTestResultItem {
	readonly id: string;
	readonly label: string;
	readonly state: QuantumIDEChatTestState;
	readonly message?: string;
	readonly uri?: URI;
	readonly line?: number;
	readonly durationMs?: number;
}

export interface IQuantumIDEChatTestRunSummary {
	readonly runId: string;
	readonly passed: number;
	readonly failed: number;
	readonly skipped: number;
	readonly running: boolean;
	readonly startedAt: number;
	readonly items: readonly IQuantumIDEChatTestResultItem[];
}

export interface IQuantumIDEChatTestPanelService {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<void>;
	getLatestRun(): IQuantumIDEChatTestRunSummary | undefined;
	getRuns(): readonly IQuantumIDEChatTestRunSummary[];
	setFilter(query: string): void;
	getFilter(): string;
	refreshFromNativeResults(): void;
}

export const IQuantumIDEChatTestPanelService = createDecorator<IQuantumIDEChatTestPanelService>('quantumIDEChatTestPanelService');
