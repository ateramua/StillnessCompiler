/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { searchSemanticIndex, type IQuantumIDESemanticIndex } from './quantumideSemanticIndex.js';

export type QuantumIDEArchitecturePattern =
	| 'mvc'
	| 'layered'
	| 'repository'
	| 'service'
	| 'singleton'
	| 'factory'
	| 'observer'
	| 'middleware';

const PATTERN_QUERIES: Record<QuantumIDEArchitecturePattern, string> = {
	mvc: 'controller model view route handler',
	layered: 'service repository domain infrastructure adapter',
	repository: 'repository interface storage database query',
	service: 'service provider inject dependency',
	singleton: 'getInstance static instance private constructor',
	factory: 'create factory build instantiate',
	observer: 'subscribe emit event listener onDid',
	middleware: 'middleware pipeline next handler intercept',
};

/** Architectural pattern retrieval over semantic index (§2.3). */
export function searchArchitecturalPatterns(
	index: IQuantumIDESemanticIndex,
	pattern: QuantumIDEArchitecturePattern,
	maxResults = 15,
): { path: string; score: number }[] {
	return searchSemanticIndex(index, PATTERN_QUERIES[pattern], maxResults);
}

export function listArchitecturePatterns(): QuantumIDEArchitecturePattern[] {
	return Object.keys(PATTERN_QUERIES) as QuantumIDEArchitecturePattern[];
}
