/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import type { IQuantumIDESemanticDocument, IQuantumIDESemanticIndex } from './quantumideSemanticIndex.js';

export const QUANTUMIDE_SEMANTIC_SHARD_DIR = '.quantumide/semantic-shards';
export const QUANTUMIDE_SEMANTIC_SHARD_SIZE = 100;

export interface IQuantumIDESemanticShardMeta {
	readonly version: 1;
	readonly generatedAt: string;
	readonly shardCount: number;
	readonly documentCount: number;
	readonly idf: Record<string, number>;
}

export function shardSemanticDocuments(documents: readonly IQuantumIDESemanticDocument[], shardSize = QUANTUMIDE_SEMANTIC_SHARD_SIZE): IQuantumIDESemanticDocument[][] {
	const shards: IQuantumIDESemanticDocument[][] = [];
	for (let i = 0; i < documents.length; i += shardSize) {
		shards.push(documents.slice(i, i + shardSize));
	}
	return shards;
}

export function buildSemanticShardMeta(index: IQuantumIDESemanticIndex): IQuantumIDESemanticShardMeta {
	return {
		version: 1,
		generatedAt: index.generatedAt,
		shardCount: Math.max(1, Math.ceil(index.documents.length / QUANTUMIDE_SEMANTIC_SHARD_SIZE)),
		documentCount: index.documents.length,
		idf: index.idf,
	};
}

export function semanticShardFileName(shardIndex: number): string {
	return `shard-${String(shardIndex).padStart(4, '0')}.json`;
}

export function mergeSemanticShards(meta: IQuantumIDESemanticShardMeta, shardDocuments: readonly (readonly IQuantumIDESemanticDocument[])[]): IQuantumIDESemanticIndex {
	return {
		version: 1,
		generatedAt: meta.generatedAt,
		idf: meta.idf,
		documents: shardDocuments.flat(),
	};
}
