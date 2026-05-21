/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';

export interface IQuantumIDEIndexScanCandidate {
	readonly resource: URI;
	readonly relativePath: string;
}

export interface IQuantumIDEChunkedIndexScanOptions {
	readonly root: URI;
	readonly maxFiles: number;
	readonly maxDepth: number;
	readonly shouldSkip: (relativePath: string) => boolean;
	readonly isIndexable: (relativePath: string, resource: URI) => boolean;
	readonly listDirectory: (resource: URI) => Promise<readonly { name: string; resource: URI; isDirectory: boolean }[]>;
	readonly yieldEveryMs?: number;
}

/**
 * Collects indexable files in breadth-first chunks, yielding to the event loop between batches.
 */
export async function collectIndexCandidatesChunked(
	options: IQuantumIDEChunkedIndexScanOptions,
	onBatch: (batch: readonly IQuantumIDEIndexScanCandidate[]) => Promise<void>,
): Promise<number> {
	let scanned = 0;
	const queue: { resource: URI; depth: number }[] = [{ resource: options.root, depth: 0 }];
	const yieldMs = options.yieldEveryMs ?? 0;
	let batch: IQuantumIDEIndexScanCandidate[] = [];
	let lastYield = Date.now();

	const flush = async (): Promise<boolean> => {
		if (batch.length === 0) {
			return scanned < options.maxFiles;
		}
		await onBatch(batch);
		batch = [];
		if (yieldMs > 0) {
			await new Promise<void>(resolve => setTimeout(resolve, yieldMs));
			lastYield = Date.now();
		}
		return scanned < options.maxFiles;
	};

	while (queue.length > 0 && scanned < options.maxFiles) {
		const current = queue.shift()!;
		if (current.depth > options.maxDepth) {
			continue;
		}
		let children: readonly { name: string; resource: URI; isDirectory: boolean }[];
		try {
			children = await options.listDirectory(current.resource);
		} catch {
			continue;
		}
		for (const child of children) {
			if (scanned >= options.maxFiles) {
				break;
			}
			const relativePath = child.resource.fsPath.slice(options.root.fsPath.length + 1);
			if (!relativePath || options.shouldSkip(relativePath)) {
				continue;
			}
			if (child.isDirectory) {
				if (child.name.startsWith('.') && child.name !== '.quantumide') {
					continue;
				}
				queue.push({ resource: child.resource, depth: current.depth + 1 });
				continue;
			}
			if (!options.isIndexable(relativePath, child.resource)) {
				continue;
			}
			batch.push({ resource: child.resource, relativePath });
			scanned++;
			if (batch.length >= 100) {
				if (!(await flush())) {
					return scanned;
				}
			}
			if (yieldMs > 0 && Date.now() - lastYield >= yieldMs * 4) {
				if (!(await flush())) {
					return scanned;
				}
			}
		}
	}
	if (batch.length > 0) {
		await onBatch(batch);
	}
	return scanned;
}
