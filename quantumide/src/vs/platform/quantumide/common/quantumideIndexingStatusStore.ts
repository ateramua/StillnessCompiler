/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../base/common/buffer.js';
import { joinPath } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import type { IFileService } from '../../files/common/files.js';
import { QUANTUMIDE_INDEXING_STATUS_FILE, type IQuantumIDEIndexingStatusSnapshot } from './quantumideWorkflowOptimization.js';

export async function writeQuantumIDEIndexingStatus(
	fileService: IFileService,
	workingDirectory: URI,
	snapshot: IQuantumIDEIndexingStatusSnapshot,
): Promise<void> {
	const uri = joinPath(workingDirectory, QUANTUMIDE_INDEXING_STATUS_FILE);
	const dir = joinPath(workingDirectory, '.quantumide');
	try {
		await fileService.createFolder(dir);
	} catch {
		// ignore
	}
	await fileService.writeFile(uri, VSBuffer.fromString(JSON.stringify(snapshot, undefined, 2)));
}

export async function readQuantumIDEIndexingStatus(
	fileService: IFileService,
	workingDirectory: URI | undefined,
): Promise<IQuantumIDEIndexingStatusSnapshot | undefined> {
	if (!workingDirectory) {
		return undefined;
	}
	const uri = joinPath(workingDirectory, QUANTUMIDE_INDEXING_STATUS_FILE);
	try {
		const raw = (await fileService.readFile(uri)).value.toString();
		const parsed = JSON.parse(raw) as Partial<IQuantumIDEIndexingStatusSnapshot>;
		if (typeof parsed.ready !== 'boolean') {
			return undefined;
		}
		return {
			ready: parsed.ready,
			busy: parsed.busy === true,
			percent: typeof parsed.percent === 'number' ? parsed.percent : undefined,
			indexedFiles: typeof parsed.indexedFiles === 'number' ? parsed.indexedFiles : 0,
			updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
			reason: typeof parsed.reason === 'string' ? parsed.reason : undefined,
		};
	} catch {
		return undefined;
	}
}

/** §6 — block host writes while indexing is required and not ready. */
export async function getIndexingGateMessage(
	fileService: IFileService,
	workingDirectory: URI | undefined,
	waitForIndexing: boolean,
): Promise<string | undefined> {
	if (!waitForIndexing || !workingDirectory) {
		return undefined;
	}
	const status = await readQuantumIDEIndexingStatus(fileService, workingDirectory);
	if (!status) {
		return 'Workspace indexing has not started. Wait for indexing to finish or disable quantumide.ai.agent.waitForIndexingBeforeEdits.';
	}
	if (status.busy || !status.ready) {
		const pct = status.percent !== undefined ? ` (${status.percent}%)` : '';
		return `Workspace indexing is still in progress${pct}. Retry after indexing completes or run **QuantumIDE: Trigger Workspace Reindex**.`;
	}
	return undefined;
}
