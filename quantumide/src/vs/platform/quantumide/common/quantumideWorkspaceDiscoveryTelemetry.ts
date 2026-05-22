/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import {
	getQuantumIDEPerfTelemetryCounters,
	QuantumIDEPerfTelemetryCounter,
	recordQuantumIDEPerfIncrementalPatch,
	resetQuantumIDEPerfTelemetryForTests,
} from './quantumidePerfTelemetry.js';

export { QuantumIDEPerfTelemetryCounter, getQuantumIDEPerfTelemetryCounters };

/** In-process counters for workspace discovery (OBS — wire to privacy opt-in telemetry later). */
export interface IQuantumIDEWorkspaceGraphTelemetryEvent {
	readonly durationMs: number;
	readonly fileCount: number;
	readonly truncated: boolean;
	readonly ignoredPathCount?: number;
}

const counters = {
	'workspace.graph.refresh': 0,
	'workspace.graph.fullRescan': 0,
	'workspace.graph.incrementalPatch': 0,
	'workspace.graph.files': 0,
	'workspace.graph.truncated': 0,
	'semantic_search_latency_ms': 0,
	'semantic.incremental_file_ms': 0,
	'workspace.graph.watcher_visible_ms': 0,
};

let lastGraphRefresh: IQuantumIDEWorkspaceGraphTelemetryEvent | undefined;

export function recordQuantumIDEWorkspaceGraphRefresh(event: IQuantumIDEWorkspaceGraphTelemetryEvent): void {
	counters['workspace.graph.refresh']++;
	counters['workspace.graph.files'] = event.fileCount;
	if (event.truncated) {
		counters['workspace.graph.truncated']++;
	}
	lastGraphRefresh = event;
}

/** Full workspace tree scan (not an incremental watcher patch). AC-01-02 / OBS-PERF. */
export function recordQuantumIDEWorkspaceGraphFullRescan(event: IQuantumIDEWorkspaceGraphTelemetryEvent): void {
	recordQuantumIDEWorkspaceGraphRefresh(event);
	counters['workspace.graph.fullRescan']++;
}

export function recordQuantumIDEWorkspaceGraphIncrementalPatch(changeCount: number): void {
	counters['workspace.graph.incrementalPatch']++;
	recordQuantumIDEPerfIncrementalPatch();
}

/** AC-01-05: scheduled debounce until graph reflects watcher change. */
export function recordQuantumIDEWatcherGraphVisibilityMs(visibilityMs: number): void {
	counters['workspace.graph.watcher_visible_ms'] = visibilityMs;
}

export function getQuantumIDEWorkspaceGraphFullRescanCount(): number {
	return counters['workspace.graph.fullRescan'];
}

export function resetQuantumIDEWorkspaceDiscoveryTelemetryForTests(): void {
	counters['workspace.graph.refresh'] = 0;
	counters['workspace.graph.fullRescan'] = 0;
	counters['workspace.graph.incrementalPatch'] = 0;
	counters['workspace.graph.files'] = 0;
	counters['workspace.graph.truncated'] = 0;
	counters['semantic_search_latency_ms'] = 0;
	counters['semantic.incremental_file_ms'] = 0;
	counters['workspace.graph.watcher_visible_ms'] = 0;
	lastGraphRefresh = undefined;
	resetQuantumIDEPerfTelemetryForTests();
}

export function recordQuantumIDESemanticSearchLatency(durationMs: number): void {
	counters['semantic_search_latency_ms'] = durationMs;
}

export function recordQuantumIDESemanticIncrementalFileLatency(durationMs: number): void {
	counters['semantic.incremental_file_ms'] = durationMs;
}

export function getQuantumIDEWorkspaceDiscoveryTelemetryCounters(): Readonly<Record<string, number>> {
	return { ...counters, ...getQuantumIDEPerfTelemetryCounters() };
}

export function getLastQuantumIDEWorkspaceGraphRefresh(): IQuantumIDEWorkspaceGraphTelemetryEvent | undefined {
	return lastGraphRefresh;
}
