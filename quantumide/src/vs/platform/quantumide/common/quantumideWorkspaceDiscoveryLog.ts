/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

export type QuantumIDEWorkspaceDiscoveryComponent =
	| 'workspace-graph'
	| 'workspace-context'
	| 'chat-context'
	| 'at-mention'
	| 'agent-search'
	| 'agent-read'
	| 'ignore-policy'
	| 'indexing-status';

export interface IQuantumIDEWorkspaceDiscoveryLogFields {
	readonly component: QuantumIDEWorkspaceDiscoveryComponent;
	readonly operation: string;
	readonly durationMs?: number;
	readonly fileCount?: number;
	readonly matchCount?: number;
	readonly truncated?: boolean;
	readonly fallback?: string;
	readonly error?: string;
}

/** Structured prefix for grep-friendly observability (OBS-02). */
export function formatQuantumIDEWorkspaceDiscoveryLog(fields: IQuantumIDEWorkspaceDiscoveryLogFields): string {
	const parts = [
		'[QuantumIDE][workspace-discovery]',
		`component=${fields.component}`,
		`op=${fields.operation}`,
	];
	if (fields.durationMs !== undefined) {
		parts.push(`durationMs=${fields.durationMs}`);
	}
	if (fields.fileCount !== undefined) {
		parts.push(`files=${fields.fileCount}`);
	}
	if (fields.matchCount !== undefined) {
		parts.push(`matches=${fields.matchCount}`);
	}
	if (fields.truncated) {
		parts.push('truncated=true');
	}
	if (fields.fallback) {
		parts.push(`fallback=${fields.fallback}`);
	}
	if (fields.error) {
		parts.push(`error=${fields.error}`);
	}
	return parts.join(' ');
}

/** OBS-05: log discovery-related feature flags once per agent session. */
export function formatQuantumIDEWorkspaceDiscoverySessionFlags(flags: {
	readonly indexingEnabled: boolean;
	readonly semanticIndexingEnabled: boolean;
	readonly tokenBudget: number;
	readonly ignoreFile: string;
	readonly syncRealtime: boolean;
}): string {
	return [
		'[QuantumIDE][workspace-discovery]',
		'component=workspace-graph',
		'op=session-feature-flags',
		`indexing=${flags.indexingEnabled}`,
		`semantic=${flags.semanticIndexingEnabled}`,
		`tokenBudget=${flags.tokenBudget}`,
		`ignoreFile=${flags.ignoreFile}`,
		`syncRealtime=${flags.syncRealtime}`,
	].join(' ');
}
