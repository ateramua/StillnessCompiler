/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../base/common/buffer.js';
import { decodeQuantumIDEFileBuffer, encodeQuantumIDEFileText } from './quantumideFileEncoding.js';
import { dirname, joinPath } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import type { IFileService } from '../../files/common/files.js';
import { markQuantumIDEPerformanceEnd, markQuantumIDEPerformanceStart, QuantumIDEPerformanceMark } from './quantumidePerformanceMarks.js';
import { detectEditConflicts, preserveFormattingStyle } from './quantumideEditEngine.js';
import { validateSourceSyntax } from './quantumideSyntaxValidate.js';
import { assertWithinBudget, QuantumIDEPerformanceBudgetMs } from './quantumidePerformanceBudgets.js';
import { isQuantumIDEAgentWritePathAllowed } from './quantumideSecurity.js';
import type { IQuantumIDEWorkspacePolicies } from './quantumideWorkspacePolicies.js';
import { resolvePathAcrossWorkspaceRoots } from './quantumideWorkspaceRoots.js';
import type { IQuantumIDEWorkspaceLink } from './workspaceLinks.js';

export const QUANTUMIDE_EDIT_CHECKPOINTS_DIR = '.quantumide/edit-checkpoints';

export type QuantumIDEWorkspaceEditOperation = 'create' | 'write' | 'delete';

export interface IQuantumIDEWorkspaceEdit {
	readonly operation: QuantumIDEWorkspaceEditOperation;
	readonly path: string;
	readonly content?: string;
}

export interface IQuantumIDEApplyWorkspaceEditsOptions {
	readonly requireDeleteConfirmation?: boolean;
	readonly maxEdits?: number;
	readonly createCheckpoints?: boolean;
	readonly workingDirectory?: URI;
	readonly workspaceLinks?: readonly IQuantumIDEWorkspaceLink[];
	/** When true (default), roll back all writes if any edit fails (§2.4 atomic workflow). */
	readonly atomic?: boolean;
	readonly validateSyntax?: boolean;
	readonly policies?: IQuantumIDEWorkspacePolicies;
	/** Skip readFile before write (faster; use when replacement is a full file body). */
	readonly skipReadBeforeWrite?: boolean;
	/** Skip preserveFormattingStyle merge (faster writes). */
	readonly skipPreserveFormatting?: boolean;
}

export interface IQuantumIDEApplyWorkspaceEditsResult {
	readonly applied: string[];
	readonly skipped: string[];
	readonly errors: string[];
}

const DEFAULT_MAX_EDITS = 40;

function validateTextEncoding(text: string): boolean {
	try {
		new TextDecoder('utf-8', { fatal: true }).decode(new TextEncoder().encode(text));
		return true;
	} catch {
		return false;
	}
}

async function writeEditCheckpoint(
	fileService: IFileService,
	workingDirectory: URI,
	relativePath: string,
	content: string,
): Promise<string> {
	const id = generateUuid();
	const checkpointDir = joinPath(workingDirectory, QUANTUMIDE_EDIT_CHECKPOINTS_DIR);
	const checkpointFile = joinPath(checkpointDir, `${id}.json`);
	await fileService.createFolder(checkpointDir);
	await fileService.writeFile(checkpointFile, VSBuffer.fromString(JSON.stringify({
		id,
		path: relativePath,
		content,
		createdAt: new Date().toISOString(),
	}, undefined, 2)));
	return id;
}

export function resolveQuantumIDEWorkspacePath(
	workingDirectory: URI | undefined,
	pathArg: string,
	workspaceLinks: readonly IQuantumIDEWorkspaceLink[] = [],
): URI {
	return resolvePathAcrossWorkspaceRoots(workingDirectory, workspaceLinks, pathArg);
}

export function parseWorkspaceEditsArg(args: Record<string, unknown>): { summary?: string; edits: IQuantumIDEWorkspaceEdit[] } {
	const summary = typeof args.summary === 'string' ? args.summary.trim() : undefined;
	const rawEdits = args.edits;
	if (!Array.isArray(rawEdits)) {
		throw new Error('apply_workspace_edits requires an edits array.');
	}
	const edits: IQuantumIDEWorkspaceEdit[] = [];
	for (const item of rawEdits) {
		if (!item || typeof item !== 'object') {
			continue;
		}
		const record = item as Record<string, unknown>;
		const operation = record.operation;
		const path = typeof record.path === 'string' ? record.path.trim() : '';
		if (!path || (operation !== 'create' && operation !== 'write' && operation !== 'delete')) {
			continue;
		}
		const content = typeof record.content === 'string' ? record.content : undefined;
		if ((operation === 'create' || operation === 'write') && content === undefined) {
			throw new Error(`apply_workspace_edits: ${operation} on ${path} requires content.`);
		}
		edits.push({ operation, path, content });
	}
	if (edits.length === 0) {
		throw new Error('apply_workspace_edits requires at least one valid edit.');
	}
	const conflicts = detectEditConflicts(edits);
	if (conflicts.length > 0) {
		throw new Error(`Edit conflicts detected: ${conflicts.map(c => `${c.path} (${c.reason})`).join('; ')}`);
	}
	return { summary, edits };
}

export async function applyQuantumIDEWorkspaceEdits(
	fileService: IFileService,
	workingDirectory: URI | undefined,
	edits: readonly IQuantumIDEWorkspaceEdit[],
	options: IQuantumIDEApplyWorkspaceEditsOptions = {},
): Promise<IQuantumIDEApplyWorkspaceEditsResult> {
	markQuantumIDEPerformanceStart(QuantumIDEPerformanceMark.ApplyWorkspaceEdits);
	const maxEdits = options.maxEdits ?? DEFAULT_MAX_EDITS;
	if (edits.length > maxEdits) {
		throw new Error(`apply_workspace_edits supports at most ${maxEdits} edits per call.`);
	}
	const applied: string[] = [];
	const skipped: string[] = [];
	const errors: string[] = [];
	const atomic = options.atomic !== false;
	const validateSyntax = options.validateSyntax !== false;
	const rollbackCheckpoints: { checkpointId: string; path: string }[] = [];
	const start = performance.now();
	for (const edit of edits) {
		const resource = resolveQuantumIDEWorkspacePath(workingDirectory, edit.path, options.workspaceLinks ?? []);
		if (options.policies?.restrictFilesystemToWorkspace !== false
			&& !isQuantumIDEAgentWritePathAllowed(workingDirectory, resource, options.policies)) {
			errors.push(`${edit.path}: blocked by workspace security policy.`);
			continue;
		}
		try {
			if (edit.operation === 'delete') {
				if (options.requireDeleteConfirmation) {
					skipped.push(`${edit.path} (delete requires confirmation)`);
					continue;
				}
				if (options.workingDirectory && await fileService.exists(resource)) {
					const prior = decodeQuantumIDEFileBuffer((await fileService.readFile(resource)).value).text;
					const checkpointId = await writeEditCheckpoint(fileService, options.workingDirectory, edit.path, prior);
					rollbackCheckpoints.push({ checkpointId, path: edit.path });
				}
				await fileService.del(resource, { recursive: true, useTrash: true });
				applied.push(`deleted ${edit.path}`);
				continue;
			}
			let content = edit.content ?? '';
			if (!validateTextEncoding(content)) {
				errors.push(`${edit.path}: invalid UTF-8 content.`);
				continue;
			}
			if (validateSyntax && (edit.operation === 'create' || edit.operation === 'write')) {
				const syntax = validateSourceSyntax(edit.path, content);
				if (!syntax.ok) {
					errors.push(`${edit.path}: syntax validation failed — ${syntax.message}`);
					continue;
				}
			}
			const exists = await fileService.exists(resource);
			if (edit.operation === 'create' && exists) {
				errors.push(`${edit.path}: create failed because the file already exists.`);
				continue;
			}
			let priorContent: string | undefined;
			let fileEncoding: ReturnType<typeof decodeQuantumIDEFileBuffer>['encoding'] = 'utf8';
			const needsPrior = exists && (options.createCheckpoints !== false
				|| (edit.operation === 'write' && options.skipPreserveFormatting !== true));
			if (needsPrior && options.skipReadBeforeWrite !== true) {
				const decoded = decodeQuantumIDEFileBuffer((await fileService.readFile(resource)).value);
				priorContent = decoded.text;
				fileEncoding = decoded.encoding;
				if (edit.operation === 'write' && options.skipPreserveFormatting !== true) {
					content = preserveFormattingStyle(priorContent, content);
				}
			}
			if (options.createCheckpoints !== false && options.workingDirectory && priorContent !== undefined) {
				const checkpointId = await writeEditCheckpoint(fileService, options.workingDirectory, edit.path, priorContent);
				rollbackCheckpoints.push({ checkpointId, path: edit.path });
				applied.push(`checkpoint ${checkpointId} for ${edit.path}`);
			}
			if (!exists) {
				await fileService.createFolder(dirname(resource));
			}
			await fileService.writeFile(resource, encodeQuantumIDEFileText(content, fileEncoding));
			applied.push(`${edit.operation === 'create' ? 'created' : 'updated'} ${edit.path}`);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			errors.push(`${edit.path}: ${message}`);
		}
	}
	if (atomic && errors.length > 0 && options.workingDirectory) {
		for (const cp of rollbackCheckpoints) {
			try {
				const checkpointFile = joinPath(options.workingDirectory, QUANTUMIDE_EDIT_CHECKPOINTS_DIR, `${cp.checkpointId}.json`);
				const raw = (await fileService.readFile(checkpointFile)).value.toString();
				const parsed = JSON.parse(raw) as { path: string; content: string };
				const resource = resolveQuantumIDEWorkspacePath(options.workingDirectory, parsed.path);
				await fileService.writeFile(resource, VSBuffer.fromString(parsed.content));
			} catch {
				// best effort rollback
			}
		}
		errors.push('Atomic transaction rolled back due to errors.');
		applied.length = 0;
	}
	const elapsed = markQuantumIDEPerformanceEnd(QuantumIDEPerformanceMark.ApplyWorkspaceEdits) ?? (performance.now() - start);
	assertWithinBudget('multiFileApply', elapsed, QuantumIDEPerformanceBudgetMs.multiFileApply);
	return { applied, skipped, errors };
}

export function formatApplyWorkspaceEditsResult(result: IQuantumIDEApplyWorkspaceEditsResult, summary?: string): string {
	const lines: string[] = [];
	if (summary) {
		lines.push(`Summary: ${summary}`);
	}
	if (result.applied.length > 0) {
		lines.push(`Applied (${result.applied.length}):`, ...result.applied.map(line => `- ${line}`));
	}
	if (result.skipped.length > 0) {
		lines.push(`Skipped (${result.skipped.length}):`, ...result.skipped.map(line => `- ${line}`));
	}
	if (result.errors.length > 0) {
		lines.push(`Errors (${result.errors.length}):`, ...result.errors.map(line => `- ${line}`));
	}
	return lines.join('\n');
}
