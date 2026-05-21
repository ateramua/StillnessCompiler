/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../base/common/buffer.js';
import { joinPath } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import type { IFileService } from '../../files/common/files.js';
import { tokenizeForSemanticIndex } from './quantumideSemanticTokenize.js';
import type { IQuantumIDEVectorDocument, IQuantumIDEVectorIndex } from './quantumideVectorEmbeddings.js';
import { embedText } from './quantumideVectorEmbeddings.js';

export const QUANTUMIDE_VECTOR_STORE_DIR = '.quantumide/vector-store';
export const QUANTUMIDE_VECTOR_STORE_MANIFEST = 'manifest.json';
export const QUANTUMIDE_VECTOR_STORE_CHUNK_PREFIX = 'chunk-';
export const QUANTUMIDE_VECTOR_STORE_CHUNK_SIZE = 500;

export interface IQuantumIDEVectorStoreManifest {
	readonly version: 1;
	readonly generatedAt: string;
	readonly dim: number;
	readonly chunkCount: number;
	readonly documentCount: number;
	readonly embeddingProvider: string;
}

export interface IQuantumIDEVectorStoreChunkMeta {
	readonly chunkIndex: number;
	readonly documentCount: number;
	readonly byteLength: number;
}

/** Serialize one chunk to a compact binary blob: [pathLen u16][path utf8][vector float32...] * n */
export function serializeVectorStoreChunk(documents: readonly IQuantumIDEVectorDocument[]): Uint8Array {
	const parts: number[] = [];
	for (const doc of documents) {
		const pathBytes = new TextEncoder().encode(doc.path);
		if (pathBytes.length > 65535) {
			continue;
		}
		parts.push(pathBytes.length & 0xff, (pathBytes.length >> 8) & 0xff);
		for (const b of pathBytes) {
			parts.push(b);
		}
		for (let i = 0; i < doc.vector.length; i++) {
			const buf = new ArrayBuffer(4);
			new DataView(buf).setFloat32(0, doc.vector[i], true);
			parts.push(...new Uint8Array(buf));
		}
	}
	return new Uint8Array(parts);
}

export function parseVectorStoreChunk(data: Uint8Array | { buffer: ArrayBuffer; byteOffset: number; byteLength: number }, dim: number): IQuantumIDEVectorDocument[] {
	const bytes = data instanceof Uint8Array ? data : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
	const documents: IQuantumIDEVectorDocument[] = [];
	let offset = 0;
	while (offset + 2 <= bytes.length) {
		const pathLen = bytes[offset] | (bytes[offset + 1] << 8);
		offset += 2;
		if (pathLen === 0 || offset + pathLen + dim * 4 > bytes.length) {
			break;
		}
		const path = new TextDecoder().decode(bytes.subarray(offset, offset + pathLen));
		offset += pathLen;
		const vector = new Float32Array(dim);
		for (let i = 0; i < dim; i++) {
			vector[i] = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getFloat32(0, true);
			offset += 4;
		}
		documents.push({ path, vector });
	}
	return documents;
}

export function buildVectorStoreManifest(
	dim: number,
	documentCount: number,
	chunkCount: number,
	embeddingProvider: string,
): IQuantumIDEVectorStoreManifest {
	return {
		version: 1,
		generatedAt: new Date().toISOString(),
		dim,
		chunkCount,
		documentCount,
		embeddingProvider,
	};
}

export function chunkVectorDocuments(documents: readonly IQuantumIDEVectorDocument[], chunkSize = QUANTUMIDE_VECTOR_STORE_CHUNK_SIZE): IQuantumIDEVectorDocument[][] {
	const chunks: IQuantumIDEVectorDocument[][] = [];
	for (let i = 0; i < documents.length; i += chunkSize) {
		chunks.push(documents.slice(i, i + chunkSize));
	}
	return chunks;
}

/** In-memory search over parsed chunk documents (used when full index not loaded). */
export function searchVectorDocuments(
	documents: readonly IQuantumIDEVectorDocument[],
	query: string,
	maxResults = 20,
): { path: string; score: number }[] {
	const q = embedText(query);
	const scores: { path: string; score: number }[] = [];
	for (const doc of documents) {
		if (doc.vector.length !== q.length) {
			continue;
		}
		let dot = 0;
		for (let i = 0; i < q.length; i++) {
			dot += q[i] * doc.vector[i];
		}
		if (dot > 0) {
			scores.push({ path: doc.path, score: dot });
		}
	}
	return scores.sort((a, b) => b.score - a.score).slice(0, maxResults);
}

export async function persistIncrementalVectorStore(
	fileService: IFileService,
	workspaceRoot: URI,
	documents: readonly { path: string; text: string }[],
	embeddingProvider: string,
	embedFn: (text: string) => Float32Array = embedText,
): Promise<IQuantumIDEVectorStoreManifest> {
	const storeUri = joinPath(workspaceRoot, QUANTUMIDE_VECTOR_STORE_DIR);
	await fileService.createFolder(storeUri);
	const index = vectorIndexFromDocuments(documents, embedFn);
	const chunks = chunkVectorDocuments(index.documents);
	for (let i = 0; i < chunks.length; i++) {
		await fileService.writeFile(
			joinPath(storeUri, `${QUANTUMIDE_VECTOR_STORE_CHUNK_PREFIX}${String(i).padStart(4, '0')}.bin`),
			VSBuffer.wrap(serializeVectorStoreChunk(chunks[i])),
		);
	}
	const manifest = buildVectorStoreManifest(index.dim, index.documents.length, chunks.length, embeddingProvider);
	await fileService.writeFile(
		joinPath(storeUri, QUANTUMIDE_VECTOR_STORE_MANIFEST),
		VSBuffer.fromString(JSON.stringify({ ...manifest, mode: 'incremental' }, undefined, 2)),
	);
	return manifest;
}

export async function loadIncrementalVectorSearch(
	fileService: IFileService,
	workspaceRoot: URI,
	query: string,
	maxResults: number,
	embedFn: (text: string) => Float32Array = embedText,
): Promise<{ path: string; score: number }[]> {
	const storeUri = joinPath(workspaceRoot, QUANTUMIDE_VECTOR_STORE_DIR);
	let manifest: IQuantumIDEVectorStoreManifest & { mode?: string };
	try {
		manifest = JSON.parse((await fileService.readFile(joinPath(storeUri, QUANTUMIDE_VECTOR_STORE_MANIFEST))).value.toString());
	} catch {
		return [];
	}
	const allDocs: IQuantumIDEVectorDocument[] = [];
	for (let i = 0; i < manifest.chunkCount; i++) {
		try {
			const bytes = (await fileService.readFile(joinPath(storeUri, `${QUANTUMIDE_VECTOR_STORE_CHUNK_PREFIX}${String(i).padStart(4, '0')}.bin`))).value;
			allDocs.push(...parseVectorStoreChunk(bytes.buffer, manifest.dim));
		} catch {
			// skip
		}
	}
	return searchVectorDocuments(allDocs, query, maxResults);
}

export function vectorIndexFromDocuments(documents: readonly { path: string; text: string }[], embedFn: (text: string) => Float32Array = embedText): IQuantumIDEVectorIndex {
	const sample = documents[0] ? embedFn(documents[0].text) : embedText('');
	return {
		version: 1,
		generatedAt: new Date().toISOString(),
		dim: sample.length,
		documents: documents.map(d => ({ path: d.path, vector: embedFn(d.text) })),
	};
}

/** Token overlap search for comments/diagnostics text fields. */
export function searchIndexedTextEntries<T extends { path: string; text?: string; message?: string }>(
	entries: readonly T[],
	query: string,
	textSelector: (entry: T) => string,
	maxResults = 20,
): { entry: T; score: number }[] {
	const terms = tokenizeForSemanticIndex(query);
	if (terms.length === 0) {
		return [];
	}
	const scores: { entry: T; score: number }[] = [];
	for (const entry of entries) {
		const hay = textSelector(entry).toLowerCase();
		let score = 0;
		for (const term of terms) {
			if (hay.includes(term)) {
				score++;
			}
		}
		if (score > 0) {
			scores.push({ entry, score });
		}
	}
	return scores.sort((a, b) => b.score - a.score).slice(0, maxResults);
}
