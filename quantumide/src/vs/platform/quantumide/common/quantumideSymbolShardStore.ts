/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../base/common/buffer.js';
import { joinPath } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import type { IFileService } from '../../files/common/files.js';
import type { IQuantumIDEAstSymbolEntry } from './quantumideSemanticIndex.js';

export const QUANTUMIDE_SYMBOL_SHARDS_DIR = '.quantumide/symbol-shards';

export interface IQuantumIDESymbolShard {
	readonly version: 1;
	readonly path: string;
	readonly updatedAt: string;
	readonly symbols: readonly IQuantumIDEAstSymbolEntry[];
}

function shardKeyForPath(workspaceRelativePath: string): string {
	return workspaceRelativePath.replace(/[/\\]/g, '__').replace(/[^a-zA-Z0-9._-]/g, '_') + '.json';
}

export async function writeQuantumIDESymbolShard(
	fileService: IFileService,
	workspaceRoot: URI,
	workspaceRelativePath: string,
	symbols: readonly IQuantumIDEAstSymbolEntry[],
): Promise<void> {
	const dir = joinPath(workspaceRoot, QUANTUMIDE_SYMBOL_SHARDS_DIR);
	await fileService.createFolder(dir);
	const shard: IQuantumIDESymbolShard = {
		version: 1,
		path: workspaceRelativePath,
		updatedAt: new Date().toISOString(),
		symbols,
	};
	await fileService.writeFile(
		joinPath(dir, shardKeyForPath(workspaceRelativePath)),
		VSBuffer.fromString(JSON.stringify(shard)),
	);
}

export async function readQuantumIDESymbolShard(
	fileService: IFileService,
	workspaceRoot: URI,
	workspaceRelativePath: string,
): Promise<IQuantumIDESymbolShard | undefined> {
	try {
		const raw = (await fileService.readFile(
			joinPath(workspaceRoot, QUANTUMIDE_SYMBOL_SHARDS_DIR, shardKeyForPath(workspaceRelativePath)),
		)).value.toString();
		const parsed = JSON.parse(raw) as IQuantumIDESymbolShard;
		return parsed?.version === 1 ? parsed : undefined;
	} catch {
		return undefined;
	}
}
