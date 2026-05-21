/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { tokenizeForSemanticIndex } from './quantumideSemanticTokenize.js';

/** Local embedding runtime (§4.2) — fixed-dimension hashed bag-of-words vectors. */
const EMBEDDING_DIM = 256;

export interface IQuantumIDEVectorDocument {
	readonly path: string;
	readonly vector: Float32Array;
}

export interface IQuantumIDEVectorIndex {
	readonly version: 1;
	readonly generatedAt: string;
	readonly dim: number;
	readonly documents: readonly IQuantumIDEVectorDocument[];
}

export function embedText(text: string): Float32Array {
	const vector = new Float32Array(EMBEDDING_DIM);
	for (const token of tokenizeForSemanticIndex(text)) {
		let hash = 0;
		for (let i = 0; i < token.length; i++) {
			hash = ((hash << 5) - hash + token.charCodeAt(i)) | 0;
		}
		const index = Math.abs(hash) % EMBEDDING_DIM;
		vector[index] += 1;
	}
	normalize(vector);
	return vector;
}

export function buildVectorIndex(
	documents: { path: string; text: string }[],
	embedFn: (text: string) => Float32Array = embedText,
): IQuantumIDEVectorIndex {
	const sample = documents[0] ? embedFn(documents[0].text) : embedText('');
	return {
		version: 1,
		generatedAt: new Date().toISOString(),
		dim: sample.length,
		documents: documents.map(doc => ({ path: doc.path, vector: embedFn(doc.text) })),
	};
}

export function searchVectorIndex(index: IQuantumIDEVectorIndex, query: string, maxResults = 20): { path: string; score: number }[] {
	const q = embedText(query);
	const scores: { path: string; score: number }[] = [];
	for (const doc of index.documents) {
		const score = cosineSimilarity(q, doc.vector);
		if (score > 0) {
			scores.push({ path: doc.path, score });
		}
	}
	return scores.sort((a, b) => b.score - a.score).slice(0, maxResults);
}

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
	let dot = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
	}
	return dot;
}

function normalize(vector: Float32Array): void {
	let sum = 0;
	for (let i = 0; i < vector.length; i++) {
		sum += vector[i] * vector[i];
	}
	const mag = Math.sqrt(sum);
	if (mag > 0) {
		for (let i = 0; i < vector.length; i++) {
			vector[i] /= mag;
		}
	}
}

export function serializeVectorIndex(index: IQuantumIDEVectorIndex): string {
	return JSON.stringify({
		...index,
		documents: index.documents.map(d => ({ path: d.path, vector: Array.from(d.vector) })),
	});
}

export function parseVectorIndexJson(raw: string): IQuantumIDEVectorIndex | undefined {
	try {
		const parsed = JSON.parse(raw) as {
			version: number;
			generatedAt: string;
			dim: number;
			documents: { path: string; vector: number[] }[];
		};
		if (parsed?.version !== 1 || !Array.isArray(parsed.documents)) {
			return undefined;
		}
		return {
			version: 1,
			generatedAt: parsed.generatedAt,
			dim: parsed.dim,
			documents: parsed.documents.map(d => ({
				path: d.path,
				vector: Float32Array.from(d.vector),
			})),
		};
	} catch {
		return undefined;
	}
}
