/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from '../../../../base/common/async.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ITerminalService } from '../../../contrib/terminal/browser/terminal.js';

export interface IQuantumIDELivePreviewResult {
	readonly output: string;
	readonly command: string;
	readonly success: boolean;
}

export interface IQuantumIDELivePreviewService {
	readonly _serviceBrand: undefined;
	runSnippetPreview(language: string | undefined, code: string, timeoutMs?: number): Promise<IQuantumIDELivePreviewResult>;
}

export const IQuantumIDELivePreviewService = createDecorator<IQuantumIDELivePreviewService>('quantumIDELivePreviewService');

export class QuantumIDELivePreviewService implements IQuantumIDELivePreviewService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@ITerminalService private readonly _terminalService: ITerminalService,
	) { }

	async runSnippetPreview(language: string | undefined, code: string, timeoutMs = 8000): Promise<IQuantumIDELivePreviewResult> {
		const lang = (language ?? 'shell').toLowerCase();
		const command = buildPreviewCommand(lang, code);
		const instance = await this._terminalService.getActiveOrCreateInstance();
		const captured: string[] = [];
		const store = new DisposableStore();
		store.add(instance.onData(data => captured.push(data)));
		try {
			await instance.sendText(command, true);
			await timeout(Math.min(timeoutMs, 15000));
		} finally {
			store.dispose();
		}
		let output = captured.join('').trim();
		if (!output && instance.xterm?.raw.buffer.active) {
			const buffer = instance.xterm.raw.buffer.active;
			const lines: string[] = [];
			const start = Math.max(0, buffer.length - 40);
			for (let i = start; i < buffer.length; i++) {
				const line = buffer.getLine(i);
				if (line) {
					lines.push(line.translateToString(true));
				}
			}
			output = lines.join('\n').trim();
		}
		return { output: output || '(no terminal output captured)', command, success: true };
	}
}

function buildPreviewCommand(language: string, code: string): string {
	const escaped = code.replace(/'/g, `'\\''`);
	switch (language) {
		case 'javascript':
		case 'typescript':
		case 'node':
			return `node -e '${escaped}'`;
		case 'python':
		case 'py':
			return `python3 -c '${escaped}'`;
		case 'shell':
		case 'bash':
		case 'sh':
			return code.includes('\n') ? code : code;
		default:
			return `printf '%s\\n' '${escaped}'`;
	}
}

registerSingleton(IQuantumIDELivePreviewService, QuantumIDELivePreviewService, InstantiationType.Delayed);
