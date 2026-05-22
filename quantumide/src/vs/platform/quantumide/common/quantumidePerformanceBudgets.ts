/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/** Performance targets from §6 (milliseconds). */
export const QuantumIDEPerformanceBudgetMs = {
	/** Chat panel open / send path (warm). */
	chatStartup: 1500,
	/** Context rebuild for standard profile (P99 ≤500ms per QPR-G.001). */
	chatContextBuild: 500,
	inlineCompletion: 200,
	semanticRetrieval: 300,
	diffRendering: 100,
	incrementalIndexing: 2000,
	/** AC-01-04: active file / watcher single-file semantic incremental (P95 ≤500ms). */
	semanticIncrementalFile: 500,
	multiFileApply: 1000,
} as const;

/** Appended when NFR-CC-01 degrades to partial context instead of failing chat send. */
export const QUANTUMIDE_PARTIAL_CONTEXT_FOOTER =
	'\n\n---\n[QuantumIDE] Partial context: discovery exceeded the configured time budget or a section failed. Use @file or agent search tools for paths not listed.\n';

export function discoveryBudgetDeadlineMs(budgetMs: number): number {
	return performance.now() + budgetMs;
}

export function isDiscoveryBudgetExceeded(deadlineMs: number): boolean {
	return performance.now() >= deadlineMs;
}

export function discoveryBudgetRemainingMs(deadlineMs: number): number {
	return Math.max(0, deadlineMs - performance.now());
}

export function appendPartialContextFooter(body: string, degraded: boolean): string {
	if (!degraded || !body.trim() || body.includes('[QuantumIDE] Partial context')) {
		return body;
	}
	return body + QUANTUMIDE_PARTIAL_CONTEXT_FOOTER;
}

/** Run one discovery step; returns undefined when the budget elapses or the step throws. */
export async function runDiscoveryWithinBudget<T>(
	label: string,
	deadlineMs: number,
	fn: () => Promise<T>,
): Promise<T | undefined> {
	if (isDiscoveryBudgetExceeded(deadlineMs)) {
		console.warn(`[QuantumIDE] Discovery ${label} skipped: time budget already exhausted`);
		return undefined;
	}
	const remaining = discoveryBudgetRemainingMs(deadlineMs);
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			fn(),
			new Promise<undefined>(resolve => {
				timer = setTimeout(() => {
					console.warn(`[QuantumIDE] Discovery ${label} timed out after ${remaining.toFixed(0)}ms`);
					resolve(undefined);
				}, remaining);
			}),
		]);
	} catch (err) {
		console.warn(`[QuantumIDE] Discovery ${label} failed:`, err);
		return undefined;
	} finally {
		if (timer !== undefined) {
			clearTimeout(timer);
		}
	}
}

let enforceQuantumIDEPerformanceBudgets = false;

export function setQuantumIDEPerformanceBudgetEnforcement(enabled: boolean): void {
	enforceQuantumIDEPerformanceBudgets = enabled;
}

export function isQuantumIDEPerformanceBudgetEnforcementEnabled(): boolean {
	return enforceQuantumIDEPerformanceBudgets;
}

export class QuantumIDEPerformanceBudgetError extends Error {
	constructor(
		readonly label: string,
		readonly elapsedMs: number,
		readonly budgetMs: number,
	) {
		super(`QuantumIDE performance budget exceeded for ${label}: ${elapsedMs.toFixed(1)}ms > ${budgetMs}ms`);
	}
}

export function assertWithinBudget(label: string, elapsedMs: number, budgetMs: number): void {
	if (elapsedMs <= budgetMs) {
		return;
	}
	if (enforceQuantumIDEPerformanceBudgets) {
		throw new QuantumIDEPerformanceBudgetError(label, elapsedMs, budgetMs);
	}
	console.warn(`[QuantumIDE] Performance budget exceeded for ${label}: ${elapsedMs.toFixed(1)}ms > ${budgetMs}ms`);
}

export async function runWithBudget<T>(label: string, budgetMs: number, fn: () => Promise<T>): Promise<T> {
	const start = performance.now();
	try {
		return await fn();
	} finally {
		assertWithinBudget(label, performance.now() - start, budgetMs);
	}
}
