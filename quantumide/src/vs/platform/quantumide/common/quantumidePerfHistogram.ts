/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/** Req-08/12: lightweight latency histogram for agent + discovery (OBS-02). */
export interface IQuantumIDEPerfHistogram {
	readonly label: string;
	readonly count: number;
	readonly p50Ms: number;
	readonly p95Ms: number;
	readonly maxMs: number;
}

const samplesByLabel = new Map<string, number[]>();
const MAX_SAMPLES = 200;

export function recordQuantumIDEPerfHistogramSample(label: string, durationMs: number): void {
	let samples = samplesByLabel.get(label);
	if (!samples) {
		samples = [];
		samplesByLabel.set(label, samples);
	}
	samples.push(durationMs);
	if (samples.length > MAX_SAMPLES) {
		samples.splice(0, samples.length - MAX_SAMPLES);
	}
}

export function getQuantumIDEPerfHistogram(label: string): IQuantumIDEPerfHistogram | undefined {
	const samples = samplesByLabel.get(label);
	if (!samples?.length) {
		return undefined;
	}
	const sorted = [...samples].sort((a, b) => a - b);
	const p50Idx = Math.floor(sorted.length * 0.5);
	const p95Idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
	return {
		label,
		count: sorted.length,
		p50Ms: sorted[p50Idx]!,
		p95Ms: sorted[p95Idx]!,
		maxMs: sorted[sorted.length - 1]!,
	};
}

export function resetQuantumIDEPerfHistogramsForTests(): void {
	samplesByLabel.clear();
}

export function formatQuantumIDEPerfHistogramLog(histogram: IQuantumIDEPerfHistogram): string {
	return `[QuantumIDE][perf] label=${histogram.label} n=${histogram.count} p50=${histogram.p50Ms.toFixed(1)}ms p95=${histogram.p95Ms.toFixed(1)}ms max=${histogram.maxMs.toFixed(1)}ms`;
}
