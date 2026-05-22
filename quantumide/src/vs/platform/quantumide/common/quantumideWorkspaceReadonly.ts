/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { FileSystemProviderCapabilities, type IFileService } from '../../files/common/files.js';
import { collectAgentSearchRoots } from './quantumideWorkspaceRoots.js';
import type { IQuantumIDEWorkspaceLink } from './workspaceLinks.js';
import { isQuantumIDERefactorHostTool } from './quantumideRefactorHostTools.js';

/** AC-03-04 / SAFE-01: cached read-only flag → reject write tools within this budget. */
export const QUANTUMIDE_WORKSPACE_READONLY_WRITE_FAIL_BUDGET_MS = 5;

/** Proposal tools that mutate workspace files when approved. */
export const QUANTUMIDE_PROPOSAL_WRITE_HOST_TOOLS = new Set(['propose_file_edit']);

/** Host tools that create/update/delete workspace files (SEC-05). */
export const QUANTUMIDE_WORKSPACE_FILE_MUTATING_HOST_TOOLS = new Set([
	'apply_workspace_edits',
	'apply_workspace_patch',
	'restore_workspace_checkpoint',
	'scaffold_project',
	'run_framework_workflow',
	'run_git_operation',
	'manage_dependency',
	'format_workspace',
	'extract_component',
	'move_module',
	'generate_test_scaffold',
	'update_package_dependency',
]);

export function isQuantumIDEWorkspaceFileMutatingHostTool(
	toolName: string,
	options?: { autoApplyEdits?: boolean },
): boolean {
	if (QUANTUMIDE_WORKSPACE_FILE_MUTATING_HOST_TOOLS.has(toolName)) {
		return true;
	}
	return options?.autoApplyEdits === true && isQuantumIDERefactorHostTool(toolName);
}

export function isQuantumIDEAgentWriteHostTool(
	toolName: string,
	options?: { autoApplyEdits?: boolean },
): boolean {
	return isQuantumIDEWorkspaceFileMutatingHostTool(toolName, options)
		|| QUANTUMIDE_PROPOSAL_WRITE_HOST_TOOLS.has(toolName);
}

let _readonlyWriteRejectCount = 0;
let _lastReadonlyWriteRejectMs = 0;

export function recordQuantumIDEWorkspaceReadonlyWriteReject(durationMs: number): void {
	_readonlyWriteRejectCount++;
	_lastReadonlyWriteRejectMs = durationMs;
}

export function getQuantumIDEWorkspaceReadonlyWriteRejectCount(): number {
	return _readonlyWriteRejectCount;
}

export function getLastQuantumIDEWorkspaceReadonlyWriteRejectMs(): number {
	return _lastReadonlyWriteRejectMs;
}

export function resetQuantumIDEWorkspaceReadonlyTelemetryForTests(): void {
	_readonlyWriteRejectCount = 0;
	_lastReadonlyWriteRejectMs = 0;
}

/**
 * O(1) fast path when `workspaceReadonly === true` is already cached (AC-03-04).
 * Returns a tool error string instead of throwing so callers avoid stack traces (SAFE-03).
 */
export function tryRejectQuantumIDEReadonlyWriteTool(
	toolName: string,
	workspaceReadonly: boolean | undefined,
	options?: { autoApplyEdits?: boolean },
): string | undefined {
	const start = performance.now();
	if (workspaceReadonly !== true || !isQuantumIDEAgentWriteHostTool(toolName, options)) {
		return undefined;
	}
	const message = formatQuantumIDEWorkspaceReadonlyToolError(toolName);
	recordQuantumIDEWorkspaceReadonlyWriteReject(performance.now() - start);
	return message;
}

export function measureQuantumIDEReadonlyWriteRejectCallMs(
	toolName: string,
	workspaceReadonly: boolean,
	options?: { autoApplyEdits?: boolean },
): number {
	const start = performance.now();
	tryRejectQuantumIDEReadonlyWriteTool(toolName, workspaceReadonly, options);
	return performance.now() - start;
}

/** User-visible tool error when the workspace filesystem is read-only (SEC-05). */
export function formatQuantumIDEWorkspaceReadonlyToolError(toolName: string): string {
	return [
		`Cannot run \`${toolName}\`: workspace is read-only.`,
		'Discovery tools (search, read, symbols) still work.',
		'Open the folder with write access or adjust VS Code Files: Readonly settings for this path.',
	].join(' ');
}

/**
 * True when any agent search root is read-only (provider capability or stat.permissions).
 */
export async function detectQuantumIDEWorkspaceReadonly(
	fileService: IFileService,
	workingDirectory: URI | undefined,
	workspaceLinks?: readonly IQuantumIDEWorkspaceLink[],
): Promise<boolean> {
	const roots = collectAgentSearchRoots(workingDirectory, workspaceLinks ?? []);
	for (const root of roots) {
		try {
			const provider = fileService.getProvider(root.scheme);
			if ((provider?.capabilities ?? 0) & FileSystemProviderCapabilities.Readonly) {
				return true;
			}
		} catch {
			// ignore
		}
		try {
			const stat = await fileService.stat(root);
			if (stat.readonly) {
				return true;
			}
		} catch {
			// ignore missing roots
		}
	}
	return false;
}

export async function assertQuantumIDEWorkspaceWritableForTool(
	fileService: IFileService,
	workingDirectory: URI | undefined,
	workspaceLinks: readonly IQuantumIDEWorkspaceLink[] | undefined,
	toolName: string,
	workspaceReadonly?: boolean,
	options?: { autoApplyEdits?: boolean },
): Promise<void> {
	const fast = tryRejectQuantumIDEReadonlyWriteTool(toolName, workspaceReadonly, options);
	if (fast) {
		throw new Error(fast);
	}
	const readonly = workspaceReadonly ?? await detectQuantumIDEWorkspaceReadonly(fileService, workingDirectory, workspaceLinks);
	if (readonly) {
		throw new Error(formatQuantumIDEWorkspaceReadonlyToolError(toolName));
	}
}
