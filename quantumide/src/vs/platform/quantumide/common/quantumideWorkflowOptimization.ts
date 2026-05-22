/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import type { IQuantumIDEApplyWorkspaceEditsOptions, IQuantumIDEWorkspaceEdit } from './quantumideWorkspaceEdits.js';

/** §3 — verification after agent edits. */
export type QuantumIDEAgentVerifyOnEdit = 'always' | 'defer' | 'never';

/** Disk write speed vs safety for agent apply_workspace_edits. */
export type QuantumIDEAgentEditVelocity = 'safe' | 'fast' | 'maximum';

export interface IQuantumIDEWorkflowOptimizationConfig {
	readonly autoApplyEdits: boolean;
	readonly instantPaletteCommands: boolean;
	readonly verifyOnEdit: QuantumIDEAgentVerifyOnEdit;
	readonly preferDirectEditorEdits: boolean;
	readonly directEditorMaxLines: number;
	readonly fastApplyEdits: boolean;
	readonly editVelocity: QuantumIDEAgentEditVelocity;
	readonly waitForIndexingBeforeEdits: boolean;
	readonly preferLspRename: boolean;
	readonly requireDeleteConfirmation: boolean;
}

export interface IQuantumIDEIndexingStatusSnapshot {
	readonly ready: boolean;
	readonly busy: boolean;
	readonly percent?: number;
	readonly indexedFiles: number;
	readonly updatedAt: string;
	readonly reason?: string;
}

export const QUANTUMIDE_INDEXING_STATUS_FILE = '.quantumide/indexing-status.json';

const DEFAULT_DIRECT_EDITOR_MAX_LINES = 100;

/** Documentation / user-guide paths should not trigger full-repo compile or editor-only redirects. */
export function isDocumentationPath(path: string): boolean {
	const normalized = path.replace(/\\/g, '/').toLowerCase();
	return normalized.includes('/docs/')
		|| normalized.startsWith('docs/')
		|| normalized.endsWith('.md')
		|| normalized.endsWith('.mdx')
		|| (normalized.endsWith('.html') && (normalized.includes('/docs/') || normalized.includes('user-guide')));
}

export function shouldSkipCompileVerificationForPaths(paths: readonly string[]): boolean {
	return paths.length > 0 && paths.every(isDocumentationPath);
}

export function extractEditedPathsFromToolArgs(toolName: string, args: Record<string, unknown>): string[] {
	if (toolName === 'apply_workspace_edits' || toolName === 'detect_edit_conflicts') {
		const raw = args.edits;
		if (!Array.isArray(raw)) {
			return [];
		}
		const paths: string[] = [];
		for (const item of raw) {
			if (item && typeof item === 'object' && typeof (item as { path?: unknown }).path === 'string') {
				paths.push((item as { path: string }).path);
			}
		}
		return paths;
	}
	if (toolName === 'apply_workspace_patch' || toolName === 'propose_file_edit') {
		const path = typeof args.path === 'string' ? args.path : '';
		return path ? [path] : [];
	}
	return [];
}

export function normalizeEditVelocity(value: unknown, fastApplyEdits?: boolean): QuantumIDEAgentEditVelocity {
	if (value === 'safe' || value === 'fast' || value === 'maximum') {
		return value;
	}
	return fastApplyEdits === true ? 'fast' : 'safe';
}

export function normalizeVerifyOnEdit(value: unknown): QuantumIDEAgentVerifyOnEdit {
	if (value === 'defer' || value === 'never') {
		return value;
	}
	return 'always';
}

export function resolveWorkflowOptimizationConfig(values: {
	autoApplyEdits?: unknown;
	instantPaletteCommands?: unknown;
	verifyOnEdit?: unknown;
	preferDirectEditorEdits?: unknown;
	directEditorMaxLines?: unknown;
	fastApplyEdits?: unknown;
	editVelocity?: unknown;
	waitForIndexingBeforeEdits?: unknown;
	preferLspRename?: unknown;
	requireDeleteConfirmation?: unknown;
}): IQuantumIDEWorkflowOptimizationConfig {
	const maxLines = typeof values.directEditorMaxLines === 'number' && values.directEditorMaxLines > 0
		? Math.min(500, Math.floor(values.directEditorMaxLines))
		: DEFAULT_DIRECT_EDITOR_MAX_LINES;
	return {
		autoApplyEdits: values.autoApplyEdits === true,
		instantPaletteCommands: values.instantPaletteCommands === true,
		verifyOnEdit: normalizeVerifyOnEdit(values.verifyOnEdit),
		preferDirectEditorEdits: values.preferDirectEditorEdits !== false,
		directEditorMaxLines: maxLines,
		fastApplyEdits: values.fastApplyEdits === true,
		editVelocity: normalizeEditVelocity(values.editVelocity, values.fastApplyEdits === true),
		waitForIndexingBeforeEdits: values.waitForIndexingBeforeEdits === true,
		preferLspRename: values.preferLspRename !== false,
		requireDeleteConfirmation: values.requireDeleteConfirmation !== false,
	};
}

export function countChangedLines(content: string | undefined): number {
	if (!content) {
		return 0;
	}
	return content.split(/\r?\n/).length;
}

/** §4 — single-file, below line threshold → prefer client editor tools (not for docs/HTML). */
export function shouldPreferDirectEditorEdit(
	edits: readonly IQuantumIDEWorkspaceEdit[],
	maxLines: number,
	preferDirectEditorEdits: boolean,
): boolean {
	if (!preferDirectEditorEdits || edits.length !== 1) {
		return false;
	}
	const edit = edits[0];
	if (edit.operation === 'delete' || isDocumentationPath(edit.path)) {
		return false;
	}
	return countChangedLines(edit.content) <= maxLines;
}

/** Auto-enable maximum velocity for documentation paths. */
export function resolveEffectiveEditVelocity(
	config: Pick<IQuantumIDEWorkflowOptimizationConfig, 'editVelocity'>,
	paths: readonly string[],
): QuantumIDEAgentEditVelocity {
	if (paths.length > 0 && paths.every(isDocumentationPath)) {
		return 'maximum';
	}
	return config.editVelocity;
}

/** §5 — map host context to apply options (fast vs safe path). */
export function resolveApplyWorkspaceEditsOptions(context: {
	editVelocity?: QuantumIDEAgentEditVelocity;
	fastApplyEdits?: boolean;
	editCount?: number;
	requireDeleteConfirmation?: boolean;
	workingDirectory?: import('../../../base/common/uri.js').URI;
	workspaceLinks?: readonly import('./workspaceLinks.js').IQuantumIDEWorkspaceLink[];
	workspacePolicies?: import('./quantumideWorkspacePolicies.js').IQuantumIDEWorkspacePolicies;
	maxEdits?: number;
}): IQuantumIDEApplyWorkspaceEditsOptions {
	const velocity = context.editVelocity ?? normalizeEditVelocity(undefined, context.fastApplyEdits === true);
	const editCount = context.editCount ?? 1;
	if (velocity === 'maximum') {
		return {
			requireDeleteConfirmation: context.requireDeleteConfirmation !== false,
			maxEdits: context.maxEdits,
			createCheckpoints: false,
			workingDirectory: context.workingDirectory,
			workspaceLinks: context.workspaceLinks,
			atomic: editCount > 1,
			validateSyntax: false,
			skipReadBeforeWrite: true,
			skipPreserveFormatting: true,
			policies: context.workspacePolicies,
		};
	}
	if (velocity === 'fast') {
		return {
			requireDeleteConfirmation: context.requireDeleteConfirmation !== false,
			maxEdits: context.maxEdits,
			createCheckpoints: false,
			workingDirectory: context.workingDirectory,
			workspaceLinks: context.workspaceLinks,
			atomic: true,
			validateSyntax: false,
			skipReadBeforeWrite: true,
			skipPreserveFormatting: true,
			policies: context.workspacePolicies,
		};
	}
	return {
		requireDeleteConfirmation: context.requireDeleteConfirmation !== false,
		maxEdits: context.maxEdits,
		createCheckpoints: true,
		workingDirectory: context.workingDirectory,
		workspaceLinks: context.workspaceLinks,
		atomic: true,
		validateSyntax: true,
		skipReadBeforeWrite: false,
		skipPreserveFormatting: false,
		policies: context.workspacePolicies,
	};
}

export function formatBatchApplySummary(summary: string | undefined, editCount: number, applied: readonly string[]): string {
	const header = summary?.trim()
		? `Batch apply (${editCount} file(s)): ${summary.trim()}`
		: `Batch apply: ${editCount} file(s)`;
	if (applied.length === 0) {
		return header;
	}
	return `${header}\n${applied.map(line => `- ${line}`).join('\n')}`;
}

export function getWorkflowOptimizationSystemAddon(config: IQuantumIDEWorkflowOptimizationConfig): string {
	const verifyLine = config.verifyOnEdit === 'always'
		? 'After substantive edits, run run_workspace_check (compile/lint/test) unless the user asked to skip verification.'
		: config.verifyOnEdit === 'defer'
			? 'Verification is deferred: do not run run_workspace_check automatically; mention that the user can run **QuantumIDE: Run Deferred Agent Verification**.'
			: 'Automatic post-edit verification is off (verifyOnEdit=never); only run run_workspace_check when the user asks.';
	const applyLine = config.autoApplyEdits
		? 'Auto-apply is ON: use apply_workspace_edits for multi-file batches (atomic). Deletes still require confirmation when configured.'
		: 'Auto-apply is OFF: use propose_file_edit or describe apply_workspace_edits plans; do not claim files changed until approved.';
	const directLine = config.preferDirectEditorEdits
		? `For single-file changes under ${config.directEditorMaxLines} lines, prefer quantumide_show_inline_suggestion or quantumide_manipulate_editor over full-file apply_workspace_edits.`
		: 'Use apply_workspace_edits or apply_workspace_patch for file changes.';
	const renameLine = config.preferLspRename
		? 'For symbol renames, use client rename / quantumide_lsp_workspace_rename (preview first). Do not use rename_symbol for workspace-wide renames.'
		: 'rename_symbol is allowed for single-file text renames.';
	const indexLine = config.waitForIndexingBeforeEdits
		? 'Before large edit batches, ensure workspace indexing is ready (read .quantumide/indexing-status.json or wait).'
		: 'Indexing wait is off; proceed with edits using search/read tools.';
	const velocityLine = config.editVelocity === 'maximum'
		? 'Edit velocity MAXIMUM: direct writeFile, no read-before-write, no checkpoints, no compile for docs — finish in one apply_workspace_edits call.'
		: config.editVelocity === 'fast'
			? 'Edit velocity FAST: skip syntax validation, checkpoints, and read-before-write on host applies.'
			: 'Edit velocity SAFE: full validation, checkpoints, and formatting preservation on host applies.';
	return [
		'QuantumIDE Workflow Optimization (7 requirements):',
		`1) ${applyLine}`,
		`2) Instant palette: ${config.instantPaletteCommands ? 'safe format/lint/test/merge commands may run without extra approval.' : 'all palette commands need normal confirmation.'}`,
		`3) ${verifyLine}`,
		`4) ${directLine}`,
		'5) Batch related file changes in one apply_workspace_edits call when auto-apply is enabled.',
		`6) ${indexLine}`,
		`7) ${renameLine}`,
		velocityLine,
	].join('\n');
}

/** Shorter agent prompt when maximum edit velocity is enabled (less tokens per turn). */
export function shouldUseCompactAgentPrompt(config: IQuantumIDEWorkflowOptimizationConfig): boolean {
	return config.editVelocity === 'maximum';
}
