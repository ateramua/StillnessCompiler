/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

export const enum QuantumIDEPerformanceMark {
	ChatStartup = 'quantumide/chatStartup',
	ChatContextBuild = 'quantumide/chatContextBuild',
	SemanticSearch = 'quantumide/semanticSearch',
	WorkspaceIndexRefresh = 'quantumide/workspaceIndexRefresh',
	ApplyWorkspaceEdits = 'quantumide/applyWorkspaceEdits',
	ApplyWorkspacePatch = 'quantumide/applyWorkspacePatch',
	InlineDiffRender = 'quantumide/inlineDiffRender',
	InlineCompletion = 'quantumide/inlineCompletion',
}

export interface IQuantumIDEPerformanceMarkEntry {
	readonly name: string;
	readonly durationMs: number;
	readonly at: number;
}

/** Human-readable labels for §6 report rows. */
export const QUANTUMIDE_PERFORMANCE_MARK_LABELS: Readonly<Record<string, string>> = {
	[QuantumIDEPerformanceMark.ChatStartup]: 'chatStartup',
	[QuantumIDEPerformanceMark.ChatContextBuild]: 'chatContextBuild',
	[QuantumIDEPerformanceMark.SemanticSearch]: 'semanticRetrieval',
	[QuantumIDEPerformanceMark.WorkspaceIndexRefresh]: 'incrementalIndexing',
	[QuantumIDEPerformanceMark.ApplyWorkspaceEdits]: 'multiFileApply',
	[QuantumIDEPerformanceMark.ApplyWorkspacePatch]: 'multiFileApply',
	[QuantumIDEPerformanceMark.InlineDiffRender]: 'diffRendering',
	[QuantumIDEPerformanceMark.InlineCompletion]: 'inlineCompletion',
};

const GLOBAL_STORE_KEY = '__quantumidePerformanceMarkStore';

interface IQuantumIDEPerformanceMarkStore {
	pending: Map<string, number>;
	recent: IQuantumIDEPerformanceMarkEntry[];
}

function getStore(): IQuantumIDEPerformanceMarkStore {
	const host = globalThis as typeof globalThis & { [GLOBAL_STORE_KEY]?: IQuantumIDEPerformanceMarkStore };
	if (!host[GLOBAL_STORE_KEY]) {
		host[GLOBAL_STORE_KEY] = { pending: new Map(), recent: [] };
	}
	return host[GLOBAL_STORE_KEY];
}

export function markQuantumIDEPerformanceStart(mark: QuantumIDEPerformanceMark): void {
	getStore().pending.set(mark, performance.now());
}

export function markQuantumIDEPerformanceEnd(mark: QuantumIDEPerformanceMark): number | undefined {
	const store = getStore();
	const start = store.pending.get(mark);
	if (start === undefined) {
		return undefined;
	}
	store.pending.delete(mark);
	const durationMs = performance.now() - start;
	recordQuantumIDEPerformanceMark(mark, durationMs);
	return durationMs;
}

export function recordQuantumIDEPerformanceMark(mark: string, durationMs: number): void {
	const store = getStore();
	store.recent.push({ name: mark, durationMs, at: Date.now() });
	if (store.recent.length > 40) {
		store.recent.splice(0, store.recent.length - 40);
	}
}

export function getQuantumIDEPerformanceMarks(): readonly IQuantumIDEPerformanceMarkEntry[] {
	return getStore().recent;
}

export function formatQuantumIDEPerformanceMarkLabel(markName: string): string {
	return QUANTUMIDE_PERFORMANCE_MARK_LABELS[markName] ?? markName.replace(/^quantumide\//, '');
}

export function getQuantumIDEPerformanceBudgetKeyForMark(markName: string): string | undefined {
	return formatQuantumIDEPerformanceMarkLabel(markName);
}
