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
	/** MP-05: prefer file lists from this workspace folder name before other roots. */
	readonly preferRootFolderName?: string;
	/** When true, split workspace file lists into primary (preferred root) vs secondary sections. */
	readonly splitRootsForRanking?: boolean;
}

export interface IQuantumIDEWorkspaceContextService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeGraph: Event<IQuantumIDEWorkspaceGraph>;
	getWorkspaceGraph(): IQuantumIDEWorkspaceGraph | undefined;
	refreshWorkspaceGraph(reason?: string): Promise<IQuantumIDEWorkspaceGraph>;
	buildWorkspaceContext(options?: IQuantumIDEWorkspaceContextBuildOptions): Promise<string>;
	/** MP-05: primary = preferred root snapshot; secondary = other roots (lower priority for ranker). */
	buildWorkspaceContextByRoot(options?: IQuantumIDEWorkspaceContextBuildOptions): Promise<{ primary: string; secondary?: string }>;
}

export const IQuantumIDEWorkspaceContextService = createDecorator<IQuantumIDEWorkspaceContextService>('quantumIDEWorkspaceContextService');
