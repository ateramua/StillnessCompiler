/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../base/common/buffer.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { dirname, joinPath } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import type { IFileService } from '../../files/common/files.js';
import { applyAstAwarePatch } from './quantumideAstPatch.js';
import { QUANTUMIDE_EDIT_CHECKPOINTS_DIR, resolveQuantumIDEWorkspacePath } from './quantumideWorkspaceEdits.js';

export interface IQuantumIDEPatchHunk {
	readonly path: string;
	readonly original: string;
	readonly patched: string;
}

export interface IQuantumIDEApplyPatchResult {
	readonly applied: string[];
	readonly errors: string[];
	readonly checkpointId?: string;
}

export function validateTextEncoding(text: string): boolean {
	try {
		return text === new TextDecoder('utf-8', { fatal: true }).decode(new TextEncoder().encode(text));
	} catch {
		return false;
	}
}

/**
 * Applies a unified diff patch to a single file when the patch contains full before/after bodies.
 * For structured multi-file edits, prefer apply_workspace_edits; this supports reviewable hunks.
 */
export async function applyUnifiedPatchToFile(
	fileService: IFileService,
	workingDirectory: URI | undefined,
	path: string,
	patch: string,
	options: { createCheckpoint?: boolean } = {},
): Promise<{ ok: boolean; message: string; checkpointId?: string }> {
	if (!validateTextEncoding(patch)) {
		return { ok: false, message: 'Patch contains invalid UTF-8 sequences.' };
	}
	const resource = resolveQuantumIDEWorkspacePath(workingDirectory, path);
	let original = '';
	try {
		if (await fileService.exists(resource)) {
			original = (await fileService.readFile(resource)).value.toString();
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return { ok: false, message: `Failed to read ${path}: ${message}` };
	}
	const astPatch = applyAstAwarePatch(original, patch);
	if (!astPatch.ok || astPatch.patched === undefined) {
		return { ok: false, message: astPatch.message ?? `Could not apply patch to ${path}: hunk context did not match.` };
	}
	const patched = astPatch.patched;
	let checkpointId: string | undefined;
	if (options.createCheckpoint !== false && workingDirectory) {
		checkpointId = await writeEditCheckpoint(fileService, workingDirectory, path, original);
	}
	try {
		if (!(await fileService.exists(resource))) {
			await fileService.createFolder(dirname(resource));
		}
		await fileService.writeFile(resource, VSBuffer.fromString(patched));
		return { ok: true, message: `Applied patch to ${path}`, checkpointId };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return { ok: false, message };
	}
}

export { applySimpleUnifiedPatch } from './quantumideSimplePatch.js';

export async function writeEditCheckpoint(
	fileService: IFileService,
	workingDirectory: URI,
	relativePath: string,
	content: string,
): Promise<string> {
	const id = generateUuid();
	const checkpointFile = joinPath(workingDirectory, QUANTUMIDE_EDIT_CHECKPOINTS_DIR, `${id}.json`);
	await fileService.createFolder(joinPath(workingDirectory, QUANTUMIDE_EDIT_CHECKPOINTS_DIR));
	await fileService.writeFile(checkpointFile, VSBuffer.fromString(JSON.stringify({
		id,
		path: relativePath,
		content,
		createdAt: new Date().toISOString(),
	}, undefined, 2)));
	return id;
}

export async function restoreEditCheckpoint(
	fileService: IFileService,
	workingDirectory: URI,
	checkpointId: string,
): Promise<string> {
	const checkpointFile = joinPath(workingDirectory, QUANTUMIDE_EDIT_CHECKPOINTS_DIR, `${checkpointId}.json`);
	const raw = (await fileService.readFile(checkpointFile)).value.toString();
	const parsed = JSON.parse(raw) as { path: string; content: string };
	const resource = resolveQuantumIDEWorkspacePath(workingDirectory, parsed.path);
	await fileService.writeFile(resource, VSBuffer.fromString(parsed.content));
	return parsed.path;
}
