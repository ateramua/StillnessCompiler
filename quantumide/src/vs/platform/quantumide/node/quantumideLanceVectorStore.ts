/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../base/common/buffer.js';
import { joinPath } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import type { IFileService } from '../../files/common/files.js';
import {
	QUANTUMIDE_VECTOR_STORE_DIR,
	buildVectorStoreManifest,
	chunkVectorDocuments,
	parseVectorStoreChunk,
	searchVectorDocuments,
	serializeVectorStoreChunk,
	vectorIndexFromDocuments,
	type IQuantumIDEVectorStoreManifest,
} from '../common/quantumideIncrementalVectorStore.js';
import { embedText } from '../common/quantumideVectorEmbeddings.js';

const LANCE_TABLE = 'quantumide_documents';

export type QuantumIDEVectorEmbedFn = (text: string) => Float32Array;

/** Persist vectors to LanceDB on disk (Node / agent-host only). Falls back to incremental chunks on failure. */
export async function persistVectorsToLanceStore(
	fileService: IFileService,
	workspaceRoot: URI,
	documents: readonly { path: string; text: string }[],
	embeddingProvider: string,
	embedFn: QuantumIDEVectorEmbedFn = embedText,
): Promise<{ mode: 'lancedb' | 'incremental'; manifest?: IQuantumIDEVectorStoreManifest }> {
	const storeUri = joinPath(workspaceRoot, QUANTUMIDE_VECTOR_STORE_DIR);
	const lanceUri = joinPath(storeUri, 'lance');
	await fileService.createFolder(storeUri);

	try {
		const lancedb = await import('@lancedb/lancedb');
		const index = vectorIndexFromDocuments(documents, embedFn);
		const rows = index.documents.map(doc => ({
			path: doc.path,
			vector: Array.from(doc.vector),
		}));
		const db = await lancedb.connect(lanceUri.fsPath);
		const tables = await db.tableNames();
		if (tables.includes(LANCE_TABLE)) {
			await db.dropTable(LANCE_TABLE);
		}
		await db.createTable(LANCE_TABLE, rows);
		const manifest = buildVectorStoreManifest(index.dim, index.documents.length, 1, `lancedb:${embeddingProvider}`);
		await fileService.writeFile(
			joinPath(storeUri, 'manifest.json'),
			VSBuffer.fromString(JSON.stringify({ ...manifest, mode: 'lancedb', table: LANCE_TABLE }, undefined, 2)),
		);
		return { mode: 'lancedb', manifest };
	} catch {
		return persistVectorsIncremental(fileService, workspaceRoot, documents, embeddingProvider, embedFn);
	}
}

export async function searchLanceVectorStore(
	fileService: IFileService,
	workspaceRoot: URI,
	query: string,
	maxResults: number,
	embedFn: QuantumIDEVectorEmbedFn = embedText,
): Promise<{ path: string; score: number }[]> {
	const storeUri = joinPath(workspaceRoot, QUANTUMIDE_VECTOR_STORE_DIR);
	try {
		const manifestRaw = (await fileService.readFile(joinPath(storeUri, 'manifest.json'))).value.toString();
		const manifest = JSON.parse(manifestRaw) as IQuantumIDEVectorStoreManifest & { mode?: string };
		if (manifest.mode === 'lancedb') {
			const lancedb = await import('@lancedb/lancedb');
			const db = await lancedb.connect(joinPath(storeUri, 'lance').fsPath);
			const table = await db.openTable(LANCE_TABLE);
			const q = embedFn(query);
			const results = await table.vectorSearch(Array.from(q)).limit(maxResults).toArray();
			return results.map((row: { path: string; _distance?: number }) => ({
				path: row.path,
				score: typeof row._distance === 'number' ? 1 / (1 + row._distance) : 1,
			}));
		}
	} catch {
		// fall through to incremental
	}
	return searchIncrementalVectorStore(fileService, workspaceRoot, query, maxResults, embedFn);
}

async function persistVectorsIncremental(
	fileService: IFileService,
	workspaceRoot: URI,
	documents: readonly { path: string; text: string }[],
	embeddingProvider: string,
	embedFn: QuantumIDEVectorEmbedFn,
): Promise<{ mode: 'incremental'; manifest: IQuantumIDEVectorStoreManifest }> {
	const storeUri = joinPath(workspaceRoot, QUANTUMIDE_VECTOR_STORE_DIR);
	await fileService.createFolder(storeUri);
	const index = vectorIndexFromDocuments(documents, embedFn);
	const chunks = chunkVectorDocuments(index.documents);
	for (let i = 0; i < chunks.length; i++) {
		const bytes = serializeVectorStoreChunk(chunks[i]);
		await fileService.writeFile(joinPath(storeUri, `chunk-${String(i).padStart(4, '0')}.bin`), VSBuffer.wrap(bytes));
	}
	const manifest = buildVectorStoreManifest(index.dim, index.documents.length, chunks.length, embeddingProvider);
	await fileService.writeFile(joinPath(storeUri, 'manifest.json'), VSBuffer.fromString(JSON.stringify({ ...manifest, mode: 'incremental' }, undefined, 2)));
	return { mode: 'incremental', manifest };
}

export async function searchIncrementalVectorStore(
	fileService: IFileService,
	workspaceRoot: URI,
	query: string,
	maxResults: number,
	embedFn: QuantumIDEVectorEmbedFn = embedText,
): Promise<{ path: string; score: number }[]> {
	const storeUri = joinPath(workspaceRoot, QUANTUMIDE_VECTOR_STORE_DIR);
	let manifest: IQuantumIDEVectorStoreManifest & { mode?: string };
	try {
		manifest = JSON.parse((await fileService.readFile(joinPath(storeUri, 'manifest.json'))).value.toString());
	} catch {
		return [];
	}
	const allDocs: { path: string; vector: Float32Array }[] = [];
	for (let i = 0; i < manifest.chunkCount; i++) {
		try {
			const bytes = (await fileService.readFile(joinPath(storeUri, `chunk-${String(i).padStart(4, '0')}.bin`))).value;
			allDocs.push(...parseVectorStoreChunk(bytes.buffer, manifest.dim));
		} catch {
			// skip chunk
		}
	}
	if (allDocs.length === 0) {
		return [];
	}
	return searchVectorDocuments(allDocs, query, maxResults);
}
