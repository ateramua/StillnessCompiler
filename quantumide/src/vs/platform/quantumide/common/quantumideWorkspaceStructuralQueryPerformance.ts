/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/** AC-01-01: structural exists / list_dir from graph index (milliseconds, P95). */
export const QUANTUMIDE_STRUCTURAL_QUERY_P95_BUDGET_MS = 10;

export function computeQuantumIDEStructuralQueryP95Ms(samples: readonly number[]): number {
	if (samples.length === 0) {
		return 0;
	}
	const sorted = [...samples].sort((a, b) => a - b);
	const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
	return sorted[idx]!;
}

/** Run `fn` repeatedly and return per-iteration durations (ms). */
export function measureQuantumIDEStructuralQuerySamples(iterations: number, fn: () => void): number[] {
	const samples: number[] = [];
	for (let i = 0; i < iterations; i++) {
		const t0 = performance.now();
		fn();
		samples.push(performance.now() - t0);
	}
	return samples;
}
