/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

export const QUANTUMIDE_APPLICATION_NAME = 'quantumide';

export function isQuantumIDEProduct(applicationName: string | undefined): boolean {
	return applicationName === QUANTUMIDE_APPLICATION_NAME;
}

export function isQuantumIDEBuild(product: { applicationName?: string; nameShort?: string; dataFolderName?: string } | undefined): boolean {
	if (!product) {
		return false;
	}
	return isQuantumIDEProduct(product.applicationName)
		|| product.nameShort === 'QuantumIDE'
		|| product.dataFolderName === '.quantumide';
}

/** Agent lifecycle phases (§2.6). */
export const enum QuantumIDEAgentLifecyclePhase {
	Planning = 'planning',
	Retrieval = 'retrieval',
	Modification = 'modification',
	Verification = 'verification',
	Review = 'review',
}

export type QuantumIDEChatModeKindId = 'ask' | 'edit' | 'agent' | 'refactor' | 'review' | 'terminal' | 'planning';

export function getQuantumIDEChatModeSystemAddon(kind: string): string {
	switch (kind) {
		case 'refactor':
			return '\n\nMode: Refactor — perform repository-aware refactors with coordinated multi-file edits, preserve formatting, and validate with run_workspace_check.';
		case 'review':
			return '\n\nMode: Review — analyze diffs and code quality; lead with findings; do not modify files unless the user asks.';
		case 'terminal':
			return '\n\nMode: Terminal — prioritize shell commands, parse build/test output, and recommend fixes from compiler errors.';
		case 'planning':
			return '\n\nMode: Planning — decompose the task, list dependencies, produce a checklist (`- [ ]` items), then execute without stopping for permission between read-only steps.';
		case 'edit':
			return '\n\nMode: Edit — make targeted modifications to the files in scope.';
		case 'ask':
			return '\n\nMode: Ask — explain and answer; do not modify files.';
		case 'agent':
		default:
			return '\n\nMode: Agent — autonomous task execution across the repository with tools.';
	}
}

export function getQuantumIDEAgentLifecyclePrompt(phase: QuantumIDEAgentLifecyclePhase): string {
	switch (phase) {
		case QuantumIDEAgentLifecyclePhase.Planning:
			return 'Phase: Planning — decompose the task, discover dependencies, and outline an execution graph.';
		case QuantumIDEAgentLifecyclePhase.Retrieval:
			return 'Phase: Retrieval — search and read relevant code before modifying.';
		case QuantumIDEAgentLifecyclePhase.Modification:
			return 'Phase: Modification — apply coordinated patches; use apply_workspace_edits for multi-file changes.';
		case QuantumIDEAgentLifecyclePhase.Verification:
			return 'Phase: Verification — run_workspace_check (compile/verify) and fix failures.';
		case QuantumIDEAgentLifecyclePhase.Review:
			return 'Phase: Review — summarize diffs and request approval for risky changes.';
	}
}

export function isAgenticChatModeKindId(kind: string | undefined): boolean {
	return kind === 'agent' || kind === 'refactor' || kind === 'terminal' || kind === 'planning';
}
