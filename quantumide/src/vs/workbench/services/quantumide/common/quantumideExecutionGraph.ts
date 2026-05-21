/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export type QuantumIDEExecutionPhase = 'planning' | 'retrieval' | 'modify' | 'verify' | 'review';

export interface IQuantumIDEExecutionGraphNode {
	readonly id: string;
	readonly phase: QuantumIDEExecutionPhase;
	readonly label: string;
	readonly status: 'pending' | 'running' | 'completed' | 'failed';
	readonly error?: string;
}

export interface IQuantumIDEExecutionGraphService {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<void>;
	getNodes(): readonly IQuantumIDEExecutionGraphNode[];
	upsertNode(node: IQuantumIDEExecutionGraphNode): Promise<void>;
	loadFromDisk(): Promise<void>;
	formatChecklist(): string;
}

export const IQuantumIDEExecutionGraphService = createDecorator<IQuantumIDEExecutionGraphService>('quantumIDEExecutionGraphService');

export const QUANTUMIDE_EXECUTION_GRAPH_FILE = '.quantumide/execution-graph.json';
