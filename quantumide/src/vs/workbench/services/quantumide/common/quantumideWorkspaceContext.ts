/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IQuantumIDEWorkspaceGraph } from '../../../../platform/quantumide/common/quantumideWorkspaceGraph.js';

export interface IQuantumIDEWorkspaceContextBuildOptions {
	readonly maxChars?: number;
	readonly includeActiveEditor?: boolean;
	readonly includeDiagnostics?: boolean;
	readonly includeSCM?: boolean;
}

export interface IQuantumIDEWorkspaceContextService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeGraph: Event<IQuantumIDEWorkspaceGraph>;
	getWorkspaceGraph(): IQuantumIDEWorkspaceGraph | undefined;
	refreshWorkspaceGraph(reason?: string): Promise<IQuantumIDEWorkspaceGraph>;
	buildWorkspaceContext(options?: IQuantumIDEWorkspaceContextBuildOptions): Promise<string>;
}

export const IQuantumIDEWorkspaceContextService = createDecorator<IQuantumIDEWorkspaceContextService>('quantumIDEWorkspaceContextService');
