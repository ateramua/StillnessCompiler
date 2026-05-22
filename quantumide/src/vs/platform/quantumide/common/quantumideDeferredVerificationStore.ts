/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../base/common/buffer.js';
import { joinPath } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import type { IFileService } from '../../files/common/files.js';

export const QUANTUMIDE_DEFERRED_VERIFY_FILE = '.quantumide/deferred-verification.json';

export interface IQuantumIDEDeferredVerificationEntry {
	readonly check: string;
	readonly requestedAt: string;
	readonly source?: string;
}

export interface IQuantumIDEDeferredVerificationQueue {
	readonly entries: IQuantumIDEDeferredVerificationEntry[];
}

export async function readDeferredVerificationQueue(
	fileService: IFileService,
	workingDirectory: URI | undefined,
): Promise<IQuantumIDEDeferredVerificationEntry[]> {
	if (!workingDirectory) {
		return [];
	}
	const uri = joinPath(workingDirectory, QUANTUMIDE_DEFERRED_VERIFY_FILE);
	try {
		const raw = (await fileService.readFile(uri)).value.toString();
		const parsed = JSON.parse(raw) as Partial<IQuantumIDEDeferredVerificationQueue>;
		return Array.isArray(parsed.entries) ? parsed.entries.filter(e => typeof e?.check === 'string') : [];
	} catch {
		return [];
	}
}

export async function appendDeferredVerification(
	fileService: IFileService,
	workingDirectory: URI,
	check: string,
	source?: string,
): Promise<void> {
	const entries = await readDeferredVerificationQueue(fileService, workingDirectory);
	entries.push({ check, requestedAt: new Date().toISOString(), source });
	const dir = joinPath(workingDirectory, '.quantumide');
	await fileService.createFolder(dir);
	await fileService.writeFile(
		joinPath(workingDirectory, QUANTUMIDE_DEFERRED_VERIFY_FILE),
		VSBuffer.fromString(JSON.stringify({ entries }, undefined, 2)),
	);
}

export async function clearDeferredVerificationQueue(
	fileService: IFileService,
	workingDirectory: URI,
): Promise<void> {
	const uri = joinPath(workingDirectory, QUANTUMIDE_DEFERRED_VERIFY_FILE);
	try {
		if (await fileService.exists(uri)) {
			await fileService.del(uri);
		}
	} catch {
		// ignore
	}
}
