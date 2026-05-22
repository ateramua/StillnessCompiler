/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { formatQuantumIDEIndexingSyncLog } from '../../common/quantumideIndexingSyncLog.js';

suite('quantumideIndexingSyncLog', () => {
	test('formatQuantumIDEIndexingSyncLog includes sync phase and percent', () => {
		const line = formatQuantumIDEIndexingSyncLog({
			phase: 'scheduled',
			reason: 'periodic-sync-5m',
			percent: 42,
			indexedFiles: 210,
		});
		assert.ok(line.includes('sync-scheduled'));
		assert.ok(line.includes('reason=periodic-sync-5m'));
		assert.ok(line.includes('percent=42'));
		assert.ok(line.includes('files=210'));
	});

	test('formatQuantumIDEIndexingSyncLog includes vector pipeline fields', () => {
		const line = formatQuantumIDEIndexingSyncLog({
			phase: 'completed',
			reason: 'open-project-vector-pipeline',
			vectorChunks: 3,
			embeddingProvider: 'local',
		});
		assert.ok(line.includes('vectorChunks=3'));
		assert.ok(line.includes('embedding=local'));
	});

	test('formatQuantumIDEIndexingSyncLog records completed cycle', () => {
		const line = formatQuantumIDEIndexingSyncLog({
			phase: 'completed',
			reason: 'workspace files changed',
			percent: 100,
			indexedFiles: 500,
			durationMs: 1200,
			ready: true,
			busy: false,
		});
		assert.ok(line.includes('sync-completed'));
		assert.ok(line.includes('durationMs=1200'));
		assert.ok(line.includes('ready=true'));
	});
});
