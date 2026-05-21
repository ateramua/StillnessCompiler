/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { isDangerousQuantumIDETerminalCommand } from './quantumideSecurity.js';
import type { IQuantumIDEWorkspacePolicies } from './quantumideWorkspacePolicies.js';

export interface IQuantumIDETerminalSandboxOptions {
	readonly blockDangerousCommands?: boolean;
	readonly workspaceRoot?: string;
	readonly lockCwdToWorkspace?: boolean;
	readonly allowedCommandPrefixes?: readonly string[];
}

export interface IQuantumIDETerminalSandboxVerdict {
	readonly allowed: boolean;
	readonly reason?: string;
}

/** Terminal sandbox policy (§2.7) — cwd lock, allowlist, dangerous-command block. */
export function evaluateQuantumIDETerminalCommand(
	command: string,
	policies: IQuantumIDEWorkspacePolicies | undefined,
	options: IQuantumIDETerminalSandboxOptions = {},
): IQuantumIDETerminalSandboxVerdict {
	const trimmed = command.trim();
	if (!trimmed) {
		return { allowed: false, reason: 'Empty command.' };
	}

	if (options.blockDangerousCommands !== false && isDangerousQuantumIDETerminalCommand(trimmed, true)) {
		return { allowed: false, reason: 'Command matches dangerous pattern (blocked by QuantumIDE terminal sandbox).' };
	}

	if (policies?.allowTerminalExecution === false) {
		return { allowed: false, reason: 'Terminal execution is disabled by workspace policy.' };
	}

	if (options.lockCwdToWorkspace !== false && options.workspaceRoot) {
		const cdMatch = trimmed.match(/^\s*cd\s+([^\s;&|]+)/i);
		if (cdMatch) {
			const target = cdMatch[1].replace(/^["']|["']$/g, '');
			if (target.startsWith('/') && !target.startsWith(options.workspaceRoot)) {
				return { allowed: false, reason: `cd outside workspace root is blocked (${target}).` };
			}
			if (target.includes('..')) {
				return { allowed: false, reason: 'cd with parent traversal is blocked by terminal sandbox.' };
			}
		}
	}

	const allowlist = options.allowedCommandPrefixes ?? policies?.allowedTerminalPrefixes;
	if (allowlist?.length) {
		const firstToken = trimmed.split(/\s+/)[0]?.toLowerCase() ?? '';
		const ok = allowlist.some(prefix => firstToken === prefix.toLowerCase() || trimmed.toLowerCase().startsWith(prefix.toLowerCase()));
		if (!ok) {
			return { allowed: false, reason: `Command not in terminal allowlist (first token: ${firstToken}).` };
		}
	}

	return { allowed: true };
}
