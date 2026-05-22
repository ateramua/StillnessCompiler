/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import {
	chunkVectorDocuments,
	parseVectorStoreChunk,
	QUANTUMIDE_VECTOR_STORE_CHUNK_SIZE,
	serializeVectorStoreChunk,
	vectorIndexFromDocuments,
} from '../../common/quantumideIncrementalVectorStore.js';
import {
	isQuantumIDEVectorIndexPeriodicSyncReason,
	QUANTUMIDE_VECTOR_INDEX_OPEN_PROJECT_DEFER_MS,
	QUANTUMIDE_VECTOR_INDEX_PERIODIC_SYNC_MS,
	QUANTUMIDE_VECTOR_INDEX_WORKFLOW_PHASES,
} from '../../common/quantumideVectorIndexWorkflow.js';

suite('quantumideVectorIndexWorkflow', () => {
	test('workflow timing constants match M-32 (~5 min sync)', () => {
		assert.strictEqual(QUANTUMIDE_VECTOR_INDEX_PERIODIC_SYNC_MS, 300_000);
		assert.strictEqual(QUANTUMIDE_VECTOR_INDEX_OPEN_PROJECT_DEFER_MS, 10_000);
		assert.ok(QUANTUMIDE_VECTOR_INDEX_WORKFLOW_PHASES.includes('chunk'));
		assert.ok(QUANTUMIDE_VECTOR_INDEX_WORKFLOW_PHASES.includes('embed'));
		assert.ok(QUANTUMIDE_VECTOR_INDEX_WORKFLOW_PHASES.includes('store'));
	});

	test('isQuantumIDEVectorIndexPeriodicSyncReason recognizes 5m sync', () => {
		assert.strictEqual(isQuantumIDEVectorIndexPeriodicSyncReason('periodic-sync-5m'), true);
		assert.strictEqual(isQuantumIDEVectorIndexPeriodicSyncReason('open-project'), false);
	});

	test('chunk → embed → store roundtrip on sample documents', () => {
		const documents = Array.from({ length: 12 }, (_, i) => ({
			path: `src/file${i}.ts`,
			text: `export const token${i} = ${i}; // QUANTUMIDE_VECTOR_FIXTURE`,
		}));
		const index = vectorIndexFromDocuments(documents);
		assert.ok(index.documents.length === 12);
		assert.ok(index.dim > 0);
		const chunks = chunkVectorDocuments(index.documents, QUANTUMIDE_VECTOR_STORE_CHUNK_SIZE);
		assert.ok(chunks.length >= 1);
		const roundtrip = parseVectorStoreChunk(serializeVectorStoreChunk(chunks[0]), index.dim);
		assert.strictEqual(roundtrip.length, chunks[0].length);
		assert.strictEqual(roundtrip[0]?.path, chunks[0][0]?.path);
	});
});
