/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import {
	getQuantumIDEPerfTelemetryCounters,
	QuantumIDEPerfTelemetryCounter,
	resetQuantumIDEPerfTelemetryForTests,
} from './quantumidePerfTelemetry.js';
import {
	resetQuantumIDEWorkspacePerformanceCoordinatorForTests,
} from './quantumideWorkspacePerformanceCoordinator.js';
import {
	resolveQuantumIDEWorkspaceTextSearch,
	type IQuantumIDEWorkspaceTextSearchPayload,
} from './quantumideWorkspaceTextSearchQueryCache.js';

export interface IQuantumIDEWorkspaceTextSearchCacheVerifyResult {
	readonly searchCalls: number;
	readonly cacheHits: number;
}

/**
 * AC-04-04: repeated identical search must hit L5 cache (one underlying search invocation).
 */
export async function verifyQuantumIDEWorkspaceTextSearchCacheAvoidsSecondSearch(): Promise<IQuantumIDEWorkspaceTextSearchCacheVerifyResult> {
	resetQuantumIDEWorkspacePerformanceCoordinatorForTests();
	resetQuantumIDEPerfTelemetryForTests();
	let searchCalls = 0;
	const runSearch = async (): Promise<IQuantumIDEWorkspaceTextSearchPayload> => {
		searchCalls++;
		return { matches: ['src/a.ts:1:needle'], durationMs: 2 };
	};
	const root = '/fixture/workspace';
	const query = 'needle';
	const maxResults = 10;
	const policyKey = '0';
	const first = await resolveQuantumIDEWorkspaceTextSearch(root, query, maxResults, policyKey, runSearch);
	const second = await resolveQuantumIDEWorkspaceTextSearch(root, query, maxResults, policyKey, runSearch);
	if (!first || !second?.fromCache) {
		throw new Error('expected second workspace text search to be served from query cache');
	}
	const cacheHits = getQuantumIDEPerfTelemetryCounters()[QuantumIDEPerfTelemetryCounter.QueryCacheHit] ?? 0;
	return { searchCalls, cacheHits };
}
