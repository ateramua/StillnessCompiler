/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../nls.js';
import type { AgentActivityKind } from './agentActivityLabels.js';
import { getAgentActivityKind } from './agentActivityLabels.js';

/** Cursor-style agent task phases shown outside chat (status bar / overlay). */
export type QuantumIDEAgentTaskPhase =
	| 'idle'
	| 'ready'
	| 'reading'
	| 'planning'
	| 'analyzing'
	| 'searching'
	| 'modifying'
	| 'verifying'
	| 'done'
	| 'error';

export interface IQuantumIDEAgentTaskPhasePresentation {
	readonly phase: QuantumIDEAgentTaskPhase;
	readonly message: string;
	readonly ariaLabel: string;
	readonly icon: string;
	readonly spinning: boolean;
	readonly kind: 'standard' | 'error' | 'warning';
}

const PHASE_PRIORITY: Record<QuantumIDEAgentTaskPhase, number> = {
	error: 100,
	modifying: 90,
	verifying: 85,
	searching: 80,
	reading: 75,
	analyzing: 70,
	planning: 60,
	done: 50,
	ready: 10,
	idle: 0,
};

export function getQuantumIDEAgentTaskPhasePriority(phase: QuantumIDEAgentTaskPhase): number {
	return PHASE_PRIORITY[phase] ?? 0;
}

export function mapActivityKindToTaskPhase(kind: AgentActivityKind, toolName?: string): QuantumIDEAgentTaskPhase {
	switch (kind) {
		case 'search':
			return 'searching';
		case 'read':
			return 'reading';
		case 'edit':
			return 'modifying';
		case 'terminal':
			return toolName === 'run_workspace_check' ? 'verifying' : 'modifying';
		case 'plan':
		case 'reasoning':
			return 'planning';
		case 'error':
			return 'error';
		case 'subagent':
			return 'analyzing';
		default:
			if (toolName === 'run_workspace_check' || toolName === 'discover_workspace_tests') {
				return 'verifying';
			}
			if (toolName === 'analyze_code_review' || toolName === 'rename' || toolName === 'vscode_renameSymbol') {
				return 'analyzing';
			}
			return 'analyzing';
	}
}

export function mapToolNameToTaskPhase(toolName: string, toolKind?: string): QuantumIDEAgentTaskPhase {
	if (toolKind && ['search', 'read', 'edit', 'terminal', 'plan', 'reasoning', 'tool', 'error', 'subagent', 'status'].includes(toolKind)) {
		return mapActivityKindToTaskPhase(toolKind as AgentActivityKind, toolName);
	}
	return mapActivityKindToTaskPhase(getAgentActivityKind(toolName), toolName);
}

export function mapSessionActivityToTaskPhase(activity: string | undefined): QuantumIDEAgentTaskPhase | undefined {
	if (!activity) {
		return 'ready';
	}
	const lower = activity.toLowerCase();
	if (lower.includes('plan')) {
		return 'planning';
	}
	if (lower.includes('work')) {
		return 'analyzing';
	}
	if (lower.includes('read')) {
		return 'reading';
	}
	if (lower.includes('search') || lower.includes('grep')) {
		return 'searching';
	}
	if (lower.includes('edit') || lower.includes('apply') || lower.includes('writ')) {
		return 'modifying';
	}
	if (lower.includes('test') || lower.includes('lint') || lower.includes('compil') || lower.includes('verif')) {
		return 'verifying';
	}
	return 'analyzing';
}

export function mapExecutionGraphPhase(phase: string): QuantumIDEAgentTaskPhase {
	switch (phase) {
		case 'planning':
			return 'planning';
		case 'retrieval':
			return 'searching';
		case 'modify':
			return 'modifying';
		case 'verify':
			return 'verifying';
		case 'review':
			return 'analyzing';
		default:
			return 'analyzing';
	}
}

export function getQuantumIDEAgentTaskPhasePresentation(
	phase: QuantumIDEAgentTaskPhase,
	detail?: string,
	customMessage?: string,
): IQuantumIDEAgentTaskPhasePresentation {
	const base = getPhaseDefaults(phase);
	const message = customMessage ?? base.message;
	const aria = detail ? `${message}. ${detail}` : message;
	return {
		phase,
		message,
		ariaLabel: aria,
		icon: base.icon,
		spinning: base.spinning,
		kind: base.kind,
	};
}

function getPhaseDefaults(phase: QuantumIDEAgentTaskPhase): Omit<IQuantumIDEAgentTaskPhasePresentation, 'phase' | 'message' | 'ariaLabel'> & { message: string } {
	switch (phase) {
		case 'reading':
			return { message: localize('quantumide.taskPhase.reading', 'Reading files…'), icon: '$(go-to-file)', spinning: true, kind: 'standard' };
		case 'planning':
			return { message: localize('quantumide.taskPhase.planning', 'Planning…'), icon: '$(sparkle)', spinning: true, kind: 'standard' };
		case 'analyzing':
			return { message: localize('quantumide.taskPhase.analyzing', 'Analyzing…'), icon: '$(eye)', spinning: true, kind: 'standard' };
		case 'searching':
			return { message: localize('quantumide.taskPhase.searching', 'Searching workspace…'), icon: '$(search)', spinning: true, kind: 'standard' };
		case 'modifying':
			return { message: localize('quantumide.taskPhase.modifying', 'Applying changes…'), icon: '$(edit)', spinning: true, kind: 'standard' };
		case 'verifying':
			return { message: localize('quantumide.taskPhase.verifying', 'Running checks…'), icon: '$(beaker)', spinning: true, kind: 'standard' };
		case 'done':
			return { message: localize('quantumide.taskPhase.done', 'Done'), icon: '$(check)', spinning: false, kind: 'standard' };
		case 'error':
			return { message: localize('quantumide.taskPhase.error', 'Task failed'), icon: '$(error)', spinning: false, kind: 'error' };
		case 'ready':
			return { message: localize('quantumide.taskPhase.ready', 'Ready'), icon: '$(circle-outline)', spinning: false, kind: 'standard' };
		case 'idle':
		default:
			return { message: localize('quantumide.taskPhase.idle', 'Idle'), icon: '$(circle-large-outline)', spinning: false, kind: 'standard' };
	}
}
