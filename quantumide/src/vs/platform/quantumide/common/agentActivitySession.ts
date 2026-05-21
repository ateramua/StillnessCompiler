/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { getAgentStatusActivityLabel, type AgentSessionStatus } from './agentActivityLabels.js';

export type AgentSessionActivityKind = AgentSessionStatus | 'unknown';

export function resolveAgentSessionActivityKind(activity: string | undefined): AgentSessionActivityKind {
	if (!activity) {
		return 'unknown';
	}
	const thinking = getAgentStatusActivityLabel('thinking');
	const working = getAgentStatusActivityLabel('working');
	const reasoning = getAgentStatusActivityLabel('reasoning');
	if (activity === thinking) {
		return 'thinking';
	}
	if (activity === working) {
		return 'working';
	}
	if (activity === reasoning) {
		return 'reasoning';
	}
	const lower = activity.toLowerCase();
	if (lower.includes('think')) {
		return 'thinking';
	}
	if (lower.includes('reason')) {
		return 'reasoning';
	}
	if (lower.includes('plan')) {
		return 'thinking';
	}
	if (lower.includes('work')) {
		return 'working';
	}
	return 'unknown';
}

export function shouldReplaceSessionActivityMessage(previous: string | undefined, next: string): boolean {
	return previous !== next;
}
