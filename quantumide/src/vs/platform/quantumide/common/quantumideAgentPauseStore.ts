/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../base/common/buffer.js';
import { joinPath } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import type { IFileService } from '../../files/common/files.js';

export const QUANTUMIDE_AGENT_PAUSE_FILE = '.quantumide/agent-pause.json';

export interface IQuantumIDEAgentPauseState {
	readonly paused: boolean;
	readonly stepMode: boolean;
	readonly updatedAt: number;
}

export async function readQuantumIDEAgentPauseState(
	fileService: IFileService,
	workspaceRoot: URI | undefined,
): Promise<IQuantumIDEAgentPauseState> {
	if (!workspaceRoot) {
		return { paused: false, stepMode: false, updatedAt: 0 };
	}
	try {
		const raw = (await fileService.readFile(joinPath(workspaceRoot, QUANTUMIDE_AGENT_PAUSE_FILE))).value.toString();
		const parsed = JSON.parse(raw) as Partial<IQuantumIDEAgentPauseState>;
		return {
			paused: !!parsed.paused,
			stepMode: !!parsed.stepMode,
			updatedAt: parsed.updatedAt ?? 0,
		};
	} catch {
		return { paused: false, stepMode: false, updatedAt: 0 };
	}
}

export async function writeQuantumIDEAgentPauseState(
	fileService: IFileService,
	workspaceRoot: URI | undefined,
	state: IQuantumIDEAgentPauseState,
): Promise<void> {
	if (!workspaceRoot) {
		return;
	}
	await fileService.createFolder(joinPath(workspaceRoot, '.quantumide'));
	await fileService.writeFile(
		joinPath(workspaceRoot, QUANTUMIDE_AGENT_PAUSE_FILE),
		VSBuffer.fromString(JSON.stringify(state)),
	);
}

export async function waitQuantumIDEAgentPauseGate(
	fileService: IFileService,
	workspaceRoot: URI | undefined,
	pollMs = 200,
): Promise<void> {
	for (;;) {
		const state = await readQuantumIDEAgentPauseState(fileService, workspaceRoot);
		if (!state.paused) {
			if (state.stepMode) {
				await writeQuantumIDEAgentPauseState(fileService, workspaceRoot, { paused: true, stepMode: true, updatedAt: Date.now() });
			}
			return;
		}
		await new Promise<void>(r => setTimeout(r, pollMs));
	}
}
