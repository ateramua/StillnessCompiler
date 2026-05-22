/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import type { IFileContent, IFileService, IFileStat, IFileStatWithPartialMetadata } from '../../files/common/files.js';
import { recordQuantumIDEFastPathMiss } from './quantumidePerfTelemetry.js';

/** BC-02: per agent-round dedupe LRU capacity. */
export const QUANTUMIDE_HOST_ROUND_FILE_CACHE_LRU_SIZE = 64;

export interface IQuantumIDEHostAgentRoundFileCacheCounters {
	readonly inflightHits: number;
	readonly lruHits: number;
	readonly statCalls: number;
	readonly readCalls: number;
	readonly resolveCalls: number;
}

export interface IQuantumIDEHostAgentRoundFileCache extends IQuantumIDEHostAgentRoundFileCacheCounters {
	coalescedStat(fileService: IFileService, resource: URI): Promise<IFileStatWithPartialMetadata>;
	coalescedReadFile(fileService: IFileService, resource: URI, options?: { length?: number }): Promise<IFileContent>;
	coalescedResolve(fileService: IFileService, resource: URI): Promise<IFileStat>;
	coalesce<T>(key: string, op: 'stat' | 'read' | 'resolve' | 'other', factory: () => Promise<T>): Promise<T>;
}

type CacheEntry = { value: unknown };

/**
 * Per agent-round IFileService coalescing (BC-02 / AC-02-03).
 * Parallel duplicate stat/read/resolve for the same URI share one in-flight promise.
 */
export function createQuantumIDEHostAgentRoundFileCache(): IQuantumIDEHostAgentRoundFileCache {
	const inflight = new Map<string, Promise<unknown>>();
	const lru = new Map<string, CacheEntry>();
	let inflightHits = 0;
	let lruHits = 0;
	let statCalls = 0;
	let readCalls = 0;
	let resolveCalls = 0;

	const touchLru = (key: string, entry: CacheEntry): void => {
		lru.delete(key);
		lru.set(key, entry);
		if (lru.size > QUANTUMIDE_HOST_ROUND_FILE_CACHE_LRU_SIZE) {
			const oldest = lru.keys().next().value;
			if (oldest !== undefined) {
				lru.delete(oldest);
			}
		}
	};

	const coalesce = async <T>(key: string, op: 'stat' | 'read' | 'resolve' | 'other', factory: () => Promise<T>): Promise<T> => {
		const cached = lru.get(key);
		if (cached) {
			lruHits++;
			touchLru(key, cached);
			return cached.value as T;
		}
		const pending = inflight.get(key);
		if (pending) {
			inflightHits++;
			return pending as Promise<T>;
		}
		const promise = factory()
			.then(value => {
				touchLru(key, { value });
				return value;
			})
			.finally(() => {
				inflight.delete(key);
			});
		inflight.set(key, promise);
		return promise;
	};

	return {
		get inflightHits() { return inflightHits; },
		get lruHits() { return lruHits; },
		get statCalls() { return statCalls; },
		get readCalls() { return readCalls; },
		get resolveCalls() { return resolveCalls; },
		coalesce,
		coalescedStat(fileService, resource) {
			const key = `stat:${resource.toString()}`;
			return coalesce(key, 'stat', () => {
				statCalls++;
				recordQuantumIDEFastPathMiss();
				return fileService.stat(resource);
			});
		},
		coalescedReadFile(fileService, resource, options) {
			const key = `read:${resource.toString()}:${options?.length ?? 'full'}`;
			return coalesce(key, 'read', () => {
				readCalls++;
				recordQuantumIDEFastPathMiss();
				return fileService.readFile(resource, options);
			});
		},
		coalescedResolve(fileService, resource) {
			const key = `resolve:${resource.toString()}`;
			return coalesce(key, 'resolve', () => {
				resolveCalls++;
				recordQuantumIDEFastPathMiss();
				return fileService.resolve(resource);
			});
		},
	};
}

/** Test / verify fixture: 8 parallel reads of one URI must coalesce IFileService stat+read. */
export async function runQuantumIDEParallelHostReadCoalesceFixture(
	readFn: (cache: IQuantumIDEHostAgentRoundFileCache) => Promise<unknown>,
	parallelReads = 8,
): Promise<IQuantumIDEHostAgentRoundFileCacheCounters & { parallelReads: number }> {
	const cache = createQuantumIDEHostAgentRoundFileCache();
	await Promise.all(Array.from({ length: parallelReads }, () => readFn(cache)));
	return {
		parallelReads,
		inflightHits: cache.inflightHits,
		lruHits: cache.lruHits,
		statCalls: cache.statCalls,
		readCalls: cache.readCalls,
		resolveCalls: cache.resolveCalls,
	};
}
