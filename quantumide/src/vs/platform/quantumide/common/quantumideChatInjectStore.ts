/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../base/common/buffer.js';
import { joinPath } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import type { IFileService } from '../../files/common/files.js';

export const QUANTUMIDE_CHAT_INJECT_FILE = '.quantumide/chat-inject.jsonl';

export type QuantumIDEChatInjectEvent =
	| { readonly kind: 'terminal'; readonly command: string; readonly exitCode: number; readonly output: string }
	| { readonly kind: 'test'; readonly output: string };

export async function appendQuantumIDEChatInjectEvent(
	fileService: IFileService,
	workspaceRoot: URI | undefined,
	event: QuantumIDEChatInjectEvent,
): Promise<void> {
	if (!workspaceRoot) {
		return;
	}
	await fileService.createFolder(joinPath(workspaceRoot, '.quantumide'));
	const file = joinPath(workspaceRoot, QUANTUMIDE_CHAT_INJECT_FILE);
	let prior = '';
	try {
		prior = (await fileService.readFile(file)).value.toString();
	} catch {
		// new file
	}
	const line = JSON.stringify({ ...event, at: Date.now() }) + '\n';
	await fileService.writeFile(file, VSBuffer.fromString(prior + line));
}

export async function drainQuantumIDEChatInjectEvents(
	fileService: IFileService,
	workspaceRoot: URI | undefined,
): Promise<QuantumIDEChatInjectEvent[]> {
	if (!workspaceRoot) {
		return [];
	}
	const file = joinPath(workspaceRoot, QUANTUMIDE_CHAT_INJECT_FILE);
	try {
		const raw = (await fileService.readFile(file)).value.toString();
		await fileService.writeFile(file, VSBuffer.fromString(''));
		const events: QuantumIDEChatInjectEvent[] = [];
		for (const line of raw.split(/\r?\n/)) {
			if (!line.trim()) {
				continue;
			}
			try {
				const parsed = JSON.parse(line) as QuantumIDEChatInjectEvent & { at?: number };
				if (parsed.kind === 'terminal') {
					events.push({ kind: 'terminal', command: parsed.command, exitCode: parsed.exitCode, output: parsed.output });
				} else if (parsed.kind === 'test') {
					events.push({ kind: 'test', output: parsed.output });
				}
			} catch {
				// skip malformed
			}
		}
		return events;
	} catch {
		return [];
	}
}
