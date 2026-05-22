/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../base/common/buffer.js';
import { joinPath } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import type { IFileService } from '../../files/common/files.js';
import type { QuantumIDEAgentPipeline } from './quantumideAgentPipeline.js';
import type { IQuantumIDEAgentContextTrackerState } from './quantumideAgentContextTracker.js';
import type { QuantumIDEAgentResponseMode } from './quantumideAgentResponseMode.js';

export const QUANTUMIDE_AGENT_SESSION_STATE_FILE = '.quantumide/agent-session-state.v1.json';

/** Req-10: disk-backed agent session continuity. */
export interface IQuantumIDEAgentSessionState {
	readonly version: 1;
	readonly sessionId: string;
	readonly updatedAt: number;
	readonly pipeline?: QuantumIDEAgentPipeline;
	readonly responseMode?: QuantumIDEAgentResponseMode;
	readonly graphGeneration?: number;
	readonly contextTracker?: IQuantumIDEAgentContextTrackerState;
	readonly summary?: string;
}

export async function writeQuantumIDEAgentSessionState(
	fileService: IFileService,
	workspaceRoot: URI | undefined,
	state: IQuantumIDEAgentSessionState,
): Promise<void> {
	if (!workspaceRoot) {
		return;
	}
	await fileService.createFolder(joinPath(workspaceRoot, '.quantumide'));
	await fileService.writeFile(
		joinPath(workspaceRoot, QUANTUMIDE_AGENT_SESSION_STATE_FILE),
		VSBuffer.fromString(JSON.stringify(state)),
	);
}

export async function readQuantumIDEAgentSessionState(
	fileService: IFileService,
	workspaceRoot: URI | undefined,
): Promise<IQuantumIDEAgentSessionState | undefined> {
	if (!workspaceRoot) {
		return undefined;
	}
	try {
		const raw = (await fileService.readFile(joinPath(workspaceRoot, QUANTUMIDE_AGENT_SESSION_STATE_FILE))).value.toString();
		const parsed = JSON.parse(raw) as IQuantumIDEAgentSessionState;
		return parsed?.version === 1 ? parsed : undefined;
	} catch {
		return undefined;
	}
}
