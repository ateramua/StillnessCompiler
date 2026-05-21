/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../base/common/buffer.js';
import { joinPath } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import type { IFileService } from '../../files/common/files.js';

export const QUANTUMIDE_AGENT_CONTEXT_SNAPSHOT_FILE = '.quantumide/agent-context.json';

export interface IQuantumIDEAgentContextSnapshot {
	readonly updatedAt: number;
	readonly activeResource?: string;
	readonly languageId?: string;
	readonly cursor?: { line: number; column: number };
	readonly selection?: { startLine: number; startColumn: number; endLine: number; endColumn: number; text: string };
	readonly openTabs: readonly string[];
	readonly summary: string;
}

export async function writeQuantumIDEAgentContextSnapshot(
	fileService: IFileService,
	workspaceRoot: URI | undefined,
	snapshot: IQuantumIDEAgentContextSnapshot,
): Promise<void> {
	if (!workspaceRoot) {
		return;
	}
	await fileService.createFolder(joinPath(workspaceRoot, '.quantumide'));
	await fileService.writeFile(
		joinPath(workspaceRoot, QUANTUMIDE_AGENT_CONTEXT_SNAPSHOT_FILE),
		VSBuffer.fromString(JSON.stringify(snapshot)),
	);
}

export async function readQuantumIDEAgentContextSnapshot(
	fileService: IFileService,
	workspaceRoot: URI | undefined,
): Promise<IQuantumIDEAgentContextSnapshot | undefined> {
	if (!workspaceRoot) {
		return undefined;
	}
	try {
		const raw = (await fileService.readFile(joinPath(workspaceRoot, QUANTUMIDE_AGENT_CONTEXT_SNAPSHOT_FILE))).value.toString();
		return JSON.parse(raw) as IQuantumIDEAgentContextSnapshot;
	} catch {
		return undefined;
	}
}
