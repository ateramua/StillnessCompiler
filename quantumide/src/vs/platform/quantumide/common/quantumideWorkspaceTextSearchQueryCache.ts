/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { formatQuantumIDEWorkspaceDiscoveryLog } from './quantumideWorkspaceDiscoveryLog.js';
import { recordQuantumIDEQueryCacheHit, recordQuantumIDEQueryCacheMiss } from './quantumidePerfTelemetry.js';
import type { IQuantumIDEWorkspaceIgnorePolicy } from './quantumideWorkspaceIgnore.js';
import {
	getQuantumIDEL5QueryResultCache,
	getQuantumIDEWorkspaceGraphGeneration,
} from './quantumideWorkspacePerformanceCoordinator.js';

export interface IQuantumIDEWorkspaceTextSearchPayload {
	readonly matches: readonly string[];
	readonly durationMs: number;
}

export interface IQuantumIDEWorkspaceTextSearchResolved {
	readonly payload: IQuantumIDEWorkspaceTextSearchPayload;
	readonly fromCache: boolean;
}

export function quantumIDEWorkspaceTextSearchPolicyKey(policy?: IQuantumIDEWorkspaceIgnorePolicy): string {
	if (!policy) {
		return '0';
	}
	return String(policy.excludedDirectoryNames.size);
}

export function buildQuantumIDEWorkspaceTextSearchCacheKey(
	rootPath: string,
	query: string,
	maxResults: number,
	policyKey: string,
): string {
	return `rg:${getQuantumIDEWorkspaceGraphGeneration()}:${rootPath}:${maxResults}:${policyKey}:${query}`;
}

export function getQuantumIDECachedWorkspaceTextSearch(cacheKey: string): IQuantumIDEWorkspaceTextSearchPayload | undefined {
	const raw = getQuantumIDEL5QueryResultCache().get(cacheKey, Date.now());
	if (!raw) {
		return undefined;
	}
	try {
		const parsed = JSON.parse(raw) as IQuantumIDEWorkspaceTextSearchPayload;
		if (!Array.isArray(parsed.matches) || typeof parsed.durationMs !== 'number') {
			return undefined;
		}
		return parsed;
	} catch {
		return undefined;
	}
}

export function setQuantumIDECachedWorkspaceTextSearch(
	cacheKey: string,
	payload: IQuantumIDEWorkspaceTextSearchPayload,
): void {
	getQuantumIDEL5QueryResultCache().set(cacheKey, JSON.stringify(payload));
}

/** L5 query cache (CACHE-03): ripgrep results keyed by generation + root + query. */
export async function resolveQuantumIDEWorkspaceTextSearch(
	rootPath: string,
	query: string,
	maxResults: number,
	policyKey: string,
	runSearch: () => Promise<IQuantumIDEWorkspaceTextSearchPayload | undefined>,
): Promise<IQuantumIDEWorkspaceTextSearchResolved | undefined> {
	const cacheKey = buildQuantumIDEWorkspaceTextSearchCacheKey(rootPath, query, maxResults, policyKey);
	const cached = getQuantumIDECachedWorkspaceTextSearch(cacheKey);
	if (cached) {
		recordQuantumIDEQueryCacheHit();
		console.info(formatQuantumIDEWorkspaceDiscoveryLog({
			component: 'agent-search',
			operation: 'query-cache-hit',
			matchCount: cached.matches.length,
		}));
		return { payload: cached, fromCache: true };
	}
	const fresh = await runSearch();
	if (!fresh) {
		return undefined;
	}
	recordQuantumIDEQueryCacheMiss();
	setQuantumIDECachedWorkspaceTextSearch(cacheKey, fresh);
	return { payload: fresh, fromCache: false };
}
