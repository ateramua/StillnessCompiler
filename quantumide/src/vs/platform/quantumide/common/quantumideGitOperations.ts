/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

export type QuantumIDEGitOperation =
	| 'status'
	| 'diff'
	| 'stage_all'
	| 'stage'
	| 'unstage'
	| 'commit'
	| 'branch'
	| 'checkout'
	| 'push'
	| 'pull'
	| 'log';

export interface IQuantumIDEGitCommandSpec {
	readonly command: string;
	readonly args: readonly string[];
	readonly requiresWrite: boolean;
}

export interface IQuantumIDEGitOperationResult {
	readonly operation: QuantumIDEGitOperation;
	readonly success: boolean;
	readonly stdout: string;
	readonly stderr: string;
	readonly exitCode: number;
}

export function buildGitCommand(operation: QuantumIDEGitOperation, options: {
	readonly paths?: readonly string[];
	readonly message?: string;
	readonly branch?: string;
	readonly remote?: string;
	readonly maxCount?: number;
} = {}): IQuantumIDEGitCommandSpec {
	switch (operation) {
		case 'status':
			return { command: 'git', args: ['status', '--short', '--branch'], requiresWrite: false };
		case 'diff':
			return { command: 'git', args: ['diff', '--stat'], requiresWrite: false };
		case 'stage_all':
			return { command: 'git', args: ['add', '-A'], requiresWrite: true };
		case 'stage':
			return { command: 'git', args: ['add', ...(options.paths ?? [])], requiresWrite: true };
		case 'unstage':
			return { command: 'git', args: ['restore', '--staged', ...(options.paths ?? ['.'])], requiresWrite: true };
		case 'commit':
			if (!options.message?.trim()) {
				throw new Error('commit requires message.');
			}
			return { command: 'git', args: ['commit', '-m', options.message.trim()], requiresWrite: true };
		case 'branch':
			if (!options.branch?.trim()) {
				throw new Error('branch requires branch name.');
			}
			return { command: 'git', args: ['checkout', '-b', options.branch.trim()], requiresWrite: true };
		case 'checkout':
			if (!options.branch?.trim()) {
				throw new Error('checkout requires branch name.');
			}
			return { command: 'git', args: ['checkout', options.branch.trim()], requiresWrite: true };
		case 'push':
			return { command: 'git', args: ['push', options.remote ?? 'origin', options.branch ?? 'HEAD'], requiresWrite: true };
		case 'pull':
			return { command: 'git', args: ['pull', options.remote ?? 'origin'], requiresWrite: true };
		case 'log':
			return { command: 'git', args: ['log', '--oneline', '-n', String(options.maxCount ?? 15)], requiresWrite: false };
		default:
			return { command: 'git', args: ['status'], requiresWrite: false };
	}
}

export function formatGitOperationResult(result: IQuantumIDEGitOperationResult): string {
	const out = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
	const status = result.success ? 'OK' : `FAILED (exit ${result.exitCode})`;
	return [`Git ${result.operation}: ${status}`, out || '(no output)'].join('\n\n');
}

export function parseGitStatusShort(output: string): { path: string; status: string }[] {
	const rows: { path: string; status: string }[] = [];
	for (const line of output.split('\n')) {
		const m = line.match(/^([ MADRCU?!]{1,2})\s+(.+)$/);
		if (m) {
			rows.push({ status: m[1].trim(), path: m[2].trim() });
		}
	}
	return rows;
}
