/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { applyQuantumIDESemanticIncrementalCore } from './quantumideSemanticIncrementalCore.js';
import { buildAstIndex, buildSemanticIndex } from './quantumideSemanticIndex.js';

/** AC-01-04 / M-29: per-file semantic incremental update (milliseconds, P95). */
export const QUANTUMIDE_SEMANTIC_INCREMENTAL_FILE_BUDGET_MS = 500;

export function computeQuantumIDESemanticIncrementalP95Ms(samples: readonly number[]): number {
	if (samples.length === 0) {
		return 0;
	}
	const sorted = [...samples].sort((a, b) => a - b);
	const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
	return sorted[idx]!;
}

/** Representative active-editor TypeScript buffer for fixture (≈400 lines). */
export function createQuantumIDESemanticIncrementalFixtureSource(): string {
	const lines: string[] = [
		'export class WidgetService {',
		'  private _items: string[] = [];',
		'  constructor(private readonly name: string) {}',
		'  add(item: string): void { this._items.push(item); }',
		'  list(): readonly string[] { return this._items; }',
		'}',
		'export function createWidget(name: string): WidgetService {',
		'  return new WidgetService(name);',
		'}',
	];
	while (lines.length < 420) {
		const i = lines.length;
		lines.push(`export const helper${i} = (x: number): number => x + ${i % 17};`);
	}
	return lines.join('\n');
}

/**
 * Measures P95 CPU time for incremental core (excludes disk read). AC-01-04 acceptance harness.
 */
export function measureQuantumIDESemanticIncrementalCoreP95Ms(iterations = 80): {
	readonly p95Ms: number;
	readonly path: string;
} {
	const text = createQuantumIDESemanticIncrementalFixtureSource();
	const path = 'src/active/EditorWidget.ts';
	const seedSemantic = buildSemanticIndex([{ path: 'src/other/File.ts', text: 'export const other = 1;' }]);
	const seedAst = buildAstIndex([{ path: 'src/other/File.ts', text: 'export const other = 1;' }]);
	const samples: number[] = [];
	for (let i = 0; i < iterations; i++) {
		const semanticIndex = seedSemantic;
		const astIndex = seedAst;
		const t0 = performance.now();
		applyQuantumIDESemanticIncrementalCore({
			relativePath: path,
			text,
			semanticIndex,
			astIndex,
		});
		samples.push(performance.now() - t0);
	}
	return { p95Ms: computeQuantumIDESemanticIncrementalP95Ms(samples), path };
}
