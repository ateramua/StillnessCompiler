/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/** In-process counters for workspace discovery (OBS — wire to privacy opt-in telemetry later). */
export interface IQuantumIDEWorkspaceGraphTelemetryEvent {
	readonly durationMs: number;
	readonly fileCount: number;
	readonly truncated: boolean;
	readonly ignoredPathCount?: number;
}

const counters = {
	'workspace.graph.refresh': 0,
	'workspace.graph.files': 0,
	'workspace.graph.truncated': 0,
	'semantic_search_latency_ms': 0,
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

export function recordQuantumIDESemanticSearchLatency(durationMs: number): void {
	counters['semantic_search_latency_ms'] = durationMs;
}

export function getQuantumIDEWorkspaceDiscoveryTelemetryCounters(): Readonly<Record<string, number>> {
	return { ...counters };
}

export function getLastQuantumIDEWorkspaceGraphRefresh(): IQuantumIDEWorkspaceGraphTelemetryEvent | undefined {
	return lastGraphRefresh;
}
