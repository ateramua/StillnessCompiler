/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/** Agent tools that work without a full workspace index (M-02 lite + §11 acceptance). */
export const QUANTUMIDE_INDEXING_OFF_DISCOVERY_TOOLS = [
	'search_workspace_text',
	'search_workspace_text_batch',
	'search_workspace_files',
	'file_search',
	'list_workspace_directory',
	'read_workspace_file',
] as const;

export function isQuantumIDELiteGraphReason(reason: string | undefined): boolean {
	return !!reason && /lite snapshot/i.test(reason);
}

/** Shown in M-04/M-05 workspace context when `quantumide.ai.indexing.enabled` is false. */
export function formatQuantumIDELiteSnapshotDisclaimer(): string {
	return [
		'Full workspace indexing is OFF (`quantumide.ai.indexing.enabled=false`).',
		'This context uses a shallow **lite snapshot** (depth ≤2, capped file list per root).',
		'Files outside the snapshot were NOT inspected.',
		`Use agent discovery tools: ${QUANTUMIDE_INDEXING_OFF_DISCOVERY_TOOLS.join(', ')}.`,
	].join(' ');
}

export function formatQuantumIDEWorkspaceContextHeaders(indexingEnabled: boolean): readonly string[] {
	const lines = ['QuantumIDE workspace intelligence context'];
	if (indexingEnabled) {
		lines.push(
			'Use this local, bounded workspace snapshot to answer project-structure questions. Do not assume files outside this snapshot were inspected.',
		);
	} else {
		lines.push(formatQuantumIDELiteSnapshotDisclaimer());
	}
	return lines;
}

export function getQuantumIDEIndexingOffDiscoverySystemAddon(indexingEnabled: boolean): string {
	if (indexingEnabled) {
		return '';
	}
	return [
		'',
		'Workspace indexing is OFF:',
		`- Chat context is a **lite snapshot** only (not a full index). ${formatQuantumIDELiteSnapshotDisclaimer()}`,
		`- Prefer ${QUANTUMIDE_INDEXING_OFF_DISCOVERY_TOOLS.join(', ')} for file discovery.`,
		'- Semantic/vector/comment/diagnostic index tools fall back automatically when indexing is disabled.',
	].join('\n');
}

export function formatQuantumIDEIndexingOffToolFallback(
	indexedToolName: string,
	fallbackBody: string,
): string {
	return [
		`Workspace indexing is disabled — \`${indexedToolName}\` index unavailable.`,
		`Use ${QUANTUMIDE_INDEXING_OFF_DISCOVERY_TOOLS.slice(0, 4).join(', ')}, etc. Discovery fallback:`,
		'',
		fallbackBody,
	].join('\n');
}
