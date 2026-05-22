/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import type { IQuantumIDEWorkspaceGraph } from './quantumideWorkspaceGraph.js';

export const QUANTUMIDE_WORKSPACE_UNTRUSTED_REASON = 'Workspace is not trusted.';

export function isQuantumIDEWorkspaceGraphUntrusted(graph: IQuantumIDEWorkspaceGraph | undefined): boolean {
	return !!graph?.status.reason?.toLowerCase().includes('not trusted');
}

/** User-visible warning injected into chat context (SEC-01 / §11). */
export function formatQuantumIDEWorkspaceTrustWarningForContext(): string {
	return [
		'**Security — workspace not trusted**',
		'VS Code workspace trust is disabled for this folder. QuantumIDE did not run a full workspace file scan or deep indexing.',
		'You can still use chat; open files and explicit attachments remain available. Trust the workspace to enable full discovery.',
	].join('\n');
}

/**
 * Validates untrusted graph policy: empty file index, no deep scan artifacts.
 * Returns error messages (empty = valid).
 */
export function validateQuantumIDEUntrustedWorkspaceGraph(graph: IQuantumIDEWorkspaceGraph): string[] {
	const errors: string[] = [];
	if (!isQuantumIDEWorkspaceGraphUntrusted(graph)) {
		errors.push('expected untrusted reason on graph.status');
	}
	if (graph.files.length !== 0) {
		errors.push(`expected 0 indexed files, got ${graph.files.length}`);
	}
	if (graph.status.indexed) {
		errors.push('expected status.indexed=false for untrusted workspace');
	}
	return errors;
}
