/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { joinPath } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import type { IFileService } from '../../files/common/files.js';
import {
	CURSOR_IGNORE_FILE,
	mergeQuantumIDEIgnorePolicy,
	QUANTUMIDE_IGNORE_FILE,
	QUANTUMIDE_INDEXING_IGNORE_FILE,
	type IQuantumIDEWorkspaceIgnorePolicy,
} from './quantumideWorkspaceIgnore.js';

export interface IQuantumIDEIgnoreLoadOptions {
	/** Unified ignore file (SEC-06): applies to index + @ + agent tools. Default `.quantumideignore`. */
	readonly unifiedIgnoreFile?: string;
}

export async function loadQuantumIDEWorkspaceIgnorePolicy(
	fileService: IFileService,
	roots: readonly URI[],
	excludedDirectoryNames: ReadonlySet<string>,
	extraSecretFileNames: readonly string[] = [],
	options: IQuantumIDEIgnoreLoadOptions = {},
): Promise<IQuantumIDEWorkspaceIgnorePolicy> {
	const unifiedName = (options.unifiedIgnoreFile?.trim() || QUANTUMIDE_IGNORE_FILE).replace(/^\/+/, '');
	const aiChunks: string[] = [];
	const indexChunks: string[] = [];
	for (const root of roots) {
		const unified = await readIgnoreFile(fileService, joinPath(root, unifiedName));
		if (unified) {
			aiChunks.push(unified);
			indexChunks.push(unified);
		}
		if (unifiedName !== CURSOR_IGNORE_FILE) {
			const cursor = await readIgnoreFile(fileService, joinPath(root, CURSOR_IGNORE_FILE));
			if (cursor) {
				aiChunks.push(cursor);
				indexChunks.push(cursor);
			}
		}
		if (unifiedName !== QUANTUMIDE_INDEXING_IGNORE_FILE) {
			const indexOnly = await readIgnoreFile(fileService, joinPath(root, QUANTUMIDE_INDEXING_IGNORE_FILE));
			if (indexOnly) {
				indexChunks.push(indexOnly);
			}
		}
		const gitignore = await readIgnoreFile(fileService, joinPath(root, '.gitignore'));
		if (gitignore) {
			indexChunks.push(gitignore);
		}
	}
	return mergeQuantumIDEIgnorePolicy(
		excludedDirectoryNames,
		aiChunks.join('\n') || undefined,
		indexChunks.join('\n') || undefined,
		extraSecretFileNames,
	);
}

async function readIgnoreFile(fileService: IFileService, uri: URI): Promise<string | undefined> {
	try {
		return (await fileService.readFile(uri)).value.toString();
	} catch {
		return undefined;
	}
}
