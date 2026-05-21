/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

export interface IQuantumIDEReplSessionState {
	readonly sessionId: string;
	readonly language: string;
	readonly history: readonly { input: string; output: string; timestamp: number }[];
	readonly variables: ReadonlyMap<string, string>;
}

export interface IQuantumIDEReplRunResult {
	readonly output: string;
	readonly stderr: string;
	readonly success: boolean;
	readonly command: string;
}

export function createReplSession(language: string, sessionId?: string): IQuantumIDEReplSessionState {
	return {
		sessionId: sessionId ?? `repl-${Date.now()}`,
		language: language.toLowerCase(),
		history: [],
		variables: new Map(),
	};
}

export function buildReplCommand(session: IQuantumIDEReplSessionState, code: string): string {
	const lang = session.language;
	const escaped = code.replace(/'/g, `'\\''`);
	switch (lang) {
		case 'python':
		case 'py':
			return `python3 -c '${escaped}'`;
		case 'javascript':
		case 'typescript':
		case 'node':
		case 'js':
		case 'ts':
			return `node -e '${escaped}'`;
		case 'shell':
		case 'bash':
		case 'sh':
			return code;
		default:
			return `printf '%s\\n' '${escaped}'`;
	}
}

export function appendReplHistory(
	session: IQuantumIDEReplSessionState,
	input: string,
	output: string,
): IQuantumIDEReplSessionState {
	const entry = { input, output, timestamp: Date.now() };
	return {
		...session,
		history: [...session.history, entry].slice(-20),
	};
}

export function formatReplOutput(result: IQuantumIDEReplRunResult, session?: IQuantumIDEReplSessionState): string {
	const parts = [
		`**REPL** \`${result.command}\``,
		result.success ? '✓ success' : '✗ failed',
		'',
		'**stdout**',
		'```',
		result.output || '(empty)',
		'```',
	];
	if (result.stderr?.trim()) {
		parts.push('', '**stderr**', '```', result.stderr.trim(), '```');
	}
	if (session && session.history.length > 0) {
		parts.push('', `Session history: ${session.history.length} run(s)`);
	}
	return parts.join('\n');
}
