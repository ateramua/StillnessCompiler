/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/** OBS-01 / AC-02-05 performance counter names (privacy-safe aggregates). */
export const QuantumIDEPerfTelemetryCounter = {
	FastPathHit: 'qide.perf.fastPathHit',
	FastPathMiss: 'qide.perf.fastPathMiss',
	RgFallback: 'qide.perf.rgFallback',
	FullRescan: 'qide.perf.fullRescan',
	IncrementalPatch: 'qide.perf.incrementalPatch',
	QueryCacheHit: 'qide.perf.queryCacheHit',
	QueryCacheMiss: 'qide.perf.queryCacheMiss',
} as const;

const perfCounters: Record<string, number> = {
	[QuantumIDEPerfTelemetryCounter.FastPathHit]: 0,
	[QuantumIDEPerfTelemetryCounter.FastPathMiss]: 0,
	[QuantumIDEPerfTelemetryCounter.RgFallback]: 0,
	[QuantumIDEPerfTelemetryCounter.FullRescan]: 0,
	[QuantumIDEPerfTelemetryCounter.IncrementalPatch]: 0,
	[QuantumIDEPerfTelemetryCounter.QueryCacheHit]: 0,
	[QuantumIDEPerfTelemetryCounter.QueryCacheMiss]: 0,
};

export function recordQuantumIDEFastPathHit(delta = 1): void {
	perfCounters[QuantumIDEPerfTelemetryCounter.FastPathHit] =
		(perfCounters[QuantumIDEPerfTelemetryCounter.FastPathHit] ?? 0) + delta;
}

/** FP-03: fast path could not answer or caller fell back to IFileService. */
export function recordQuantumIDEFastPathMiss(delta = 1): void {
	perfCounters[QuantumIDEPerfTelemetryCounter.FastPathMiss] =
		(perfCounters[QuantumIDEPerfTelemetryCounter.FastPathMiss] ?? 0) + delta;
}

export function recordQuantumIDERgFallback(delta = 1): void {
	perfCounters[QuantumIDEPerfTelemetryCounter.RgFallback] =
		(perfCounters[QuantumIDEPerfTelemetryCounter.RgFallback] ?? 0) + delta;
}

export function recordQuantumIDEPerfFullRescan(delta = 1): void {
	perfCounters[QuantumIDEPerfTelemetryCounter.FullRescan] =
		(perfCounters[QuantumIDEPerfTelemetryCounter.FullRescan] ?? 0) + delta;
}

export function recordQuantumIDEPerfIncrementalPatch(delta = 1): void {
	perfCounters[QuantumIDEPerfTelemetryCounter.IncrementalPatch] =
		(perfCounters[QuantumIDEPerfTelemetryCounter.IncrementalPatch] ?? 0) + delta;
}

export function recordQuantumIDEQueryCacheHit(delta = 1): void {
	perfCounters[QuantumIDEPerfTelemetryCounter.QueryCacheHit] =
		(perfCounters[QuantumIDEPerfTelemetryCounter.QueryCacheHit] ?? 0) + delta;
}

export function recordQuantumIDEQueryCacheMiss(delta = 1): void {
	perfCounters[QuantumIDEPerfTelemetryCounter.QueryCacheMiss] =
		(perfCounters[QuantumIDEPerfTelemetryCounter.QueryCacheMiss] ?? 0) + delta;
}

export function getQuantumIDEPerfTelemetryCounters(): Readonly<Record<string, number>> {
	return { ...perfCounters };
}

export function resetQuantumIDEPerfTelemetryForTests(): void {
	for (const key of Object.keys(perfCounters)) {
		perfCounters[key] = 0;
	}
}
