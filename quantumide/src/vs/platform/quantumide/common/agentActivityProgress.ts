/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../nls.js';

export type QuantumIDEExecutionGraphPhase = 'planning' | 'retrieval' | 'modify' | 'verify' | 'review';

export function formatActivityCapSummaryMessage(suppressedCount: number): string {
	return localize('quantumide.agentActivity.capSummary', 'Ran {0} more tools…', suppressedCount);
}

export function shouldCoalesceActivityLabels(
	previousLabel: string | undefined,
	previousAt: number | undefined,
	nextLabel: string,
	now: number,
	windowMs = 300,
): boolean {
	return !!previousLabel
		&& previousLabel === nextLabel
		&& previousAt !== undefined
		&& now - previousAt < windowMs;
}

export function getExecutionGraphPhaseActivityLabel(phase: QuantumIDEExecutionGraphPhase, label: string): string {
	switch (phase) {
		case 'planning':
			return localize('quantumide.agentActivity.graphPlanning', 'Planning: {0}', label);
		case 'retrieval':
			return localize('quantumide.agentActivity.graphRetrieval', 'Searching: {0}', label);
		case 'modify':
			return localize('quantumide.agentActivity.graphModify', 'Applying changes: {0}', label);
		case 'verify':
			return localize('quantumide.agentActivity.graphVerify', 'Verifying: {0}', label);
		case 'review':
			return localize('quantumide.agentActivity.graphReview', 'Reviewing: {0}', label);
		default:
			return label;
	}
}

export function formatOrchestratorStepActivity(stepIndex: number, stepCount: number, label: string): string {
	return localize('quantumide.agentActivity.orchestratorStep', 'Step {0}/{1}: {2}', stepIndex, stepCount, label);
}

const SECRET_PATTERNS = [
	/\bsk-[a-zA-Z0-9]{8,}\b/,
	/\bghp_[a-zA-Z0-9]{20,}\b/,
	/\bBearer\s+[a-zA-Z0-9._-]{8,}\b/i,
];

export function sanitizeActivityDetailText(text: string | undefined): string | undefined {
	if (!text) {
		return undefined;
	}
	for (const pattern of SECRET_PATTERNS) {
		if (pattern.test(text)) {
			return undefined;
		}
	}
	return text;
}
