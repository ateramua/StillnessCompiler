/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import type { IQuantumIDEAstIndex, IQuantumIDESemanticIndex } from './quantumideSemanticIndex.js';

export interface IQuantumIDEIndexerCpuWorkerArgs {
	readonly relativePath: string;
	readonly text: string;
	readonly semanticIndex?: IQuantumIDESemanticIndex;
	readonly astIndex?: IQuantumIDEAstIndex;
}

export interface IQuantumIDEIndexerCpuWorkerResult {
	readonly semanticIndex?: IQuantumIDESemanticIndex;
	readonly astIndex?: IQuantumIDEAstIndex;
	readonly commentsEntryCount: number;
	readonly symbolCount: number;
}

export interface IQuantumIDEIndexerCpuWorker {
	$applyIncrementalCore(args: IQuantumIDEIndexerCpuWorkerArgs): Promise<IQuantumIDEIndexerCpuWorkerResult>;
}
