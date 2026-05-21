/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/** Commands that must never run via agent `execute_workbench_command` / `quantumide_execute_workbench_command`. */
export const QUANTUMIDE_COMMAND_DENYLIST: readonly string[] = [
	'workbench.action.closeAllEditors',
	'workbench.action.closeWindow',
	'workbench.action.quit',
	'workbench.action.reloadWindow',
	'workbench.action.files.deleteFile',
	'workbench.action.files.deleteFolder',
	'deleteAllLeft',
	'deleteAllRight',
	'workbench.action.terminal.kill',
	'workbench.action.terminal.killAll',
	'workbench.action.removeRootFolder',
	'workbench.action.openSettingsJson',
	'workbench.action.openGlobalKeybindings',
	'workbench.action.configureRuntimeArguments',
	'workbench.extensions.installExtension',
	'workbench.extensions.uninstallExtension',
	'git.clean',
	'git.cleanAll',
	'git.reset',
	'git.revertSelectedRanges',
];

export interface IQuantumIDECommandPolicyResult {
	readonly allowed: boolean;
	readonly reason?: string;
}

export function evaluateQuantumIDECommandPolicy(commandId: string, options?: { dangerousBlockEnabled?: boolean }): IQuantumIDECommandPolicyResult {
	const id = commandId.trim();
	if (!id) {
		return { allowed: false, reason: 'Empty command id.' };
	}
	if (QUANTUMIDE_COMMAND_DENYLIST.includes(id)) {
		return { allowed: false, reason: `Command "${id}" is blocked by QuantumIDE policy.` };
	}
	if (options?.dangerousBlockEnabled !== false) {
		if (/\.delete|\.kill|\.uninstall|\.reset|\.clean|\.quit|\.closeWindow/i.test(id)) {
			return { allowed: false, reason: `Command "${id}" matches dangerous pattern and is blocked.` };
		}
	}
	return { allowed: true };
}

export function filterMatchingCommands(query: string, commandIds: readonly string[], maxResults = 25): string[] {
	const q = query.trim().toLowerCase();
	if (!q) {
		return commandIds.slice(0, maxResults);
	}
	const scored: { id: string; score: number }[] = [];
	for (const id of commandIds) {
		const lower = id.toLowerCase();
		if (lower === q) {
			scored.push({ id, score: 100 });
			continue;
		}
		if (lower.startsWith(q)) {
			scored.push({ id, score: 80 });
			continue;
		}
		if (lower.includes(q)) {
			scored.push({ id, score: 50 + (lower.length - q.length) });
		}
	}
	return scored.sort((a, b) => b.score - a.score).slice(0, maxResults).map(s => s.id);
}
