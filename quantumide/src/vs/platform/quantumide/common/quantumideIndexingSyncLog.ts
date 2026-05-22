/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { formatQuantumIDEWorkspaceDiscoveryLog } from './quantumideWorkspaceDiscoveryLog.js';

export type QuantumIDEIndexingSyncPhase = 'scheduled' | 'started' | 'progress' | 'completed' | 'idle';

export interface IQuantumIDEIndexingSyncLogFields {
	readonly phase: QuantumIDEIndexingSyncPhase;
	readonly reason?: string;
	readonly percent?: number;
	readonly indexedFiles?: number;
	readonly durationMs?: number;
	readonly ready?: boolean;
	readonly busy?: boolean;
	/** Vector store chunk files written under `.quantumide/vector-store/` (M-32). */
	readonly vectorChunks?: number;
	readonly embeddingProvider?: string;
}

/** Structured log line for background indexer sync cycles (M-26 / M-32). */
export function formatQuantumIDEIndexingSyncLog(fields: IQuantumIDEIndexingSyncLogFields): string {
	const base = formatQuantumIDEWorkspaceDiscoveryLog({
		component: 'indexing-status',
		operation: `sync-${fields.phase}`,
		durationMs: fields.durationMs,
		fileCount: fields.indexedFiles,
	});
	const extra: string[] = [base];
	if (fields.reason) {
		extra.push(`reason=${fields.reason}`);
	}
	if (fields.percent !== undefined) {
		extra.push(`percent=${fields.percent}`);
	}
	if (fields.ready !== undefined) {
		extra.push(`ready=${fields.ready}`);
	}
	if (fields.busy !== undefined) {
		extra.push(`busy=${fields.busy}`);
	}
	if (fields.vectorChunks !== undefined) {
		extra.push(`vectorChunks=${fields.vectorChunks}`);
	}
	if (fields.embeddingProvider) {
		extra.push(`embedding=${fields.embeddingProvider}`);
	}
	return extra.join(' ');
}
