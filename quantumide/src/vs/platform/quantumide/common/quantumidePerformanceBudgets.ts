/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/** Performance targets from §6 (milliseconds). */
export const QuantumIDEPerformanceBudgetMs = {
	chatStartup: 1500,
	inlineCompletion: 200,
	semanticRetrieval: 300,
	diffRendering: 100,
	incrementalIndexing: 2000,
	multiFileApply: 1000,
} as const;

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
