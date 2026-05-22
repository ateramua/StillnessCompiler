/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/** FR-03-01 intent labels. */
export type QuantumIDEAgentIntent = 'fs_simple' | 'search_only' | 'edit' | 'explain' | 'full';

/** PL-* execution pipelines. */
export type QuantumIDEAgentPipeline = 'lite' | 'standard' | 'full';

/** FR-03-06 user override. */
export type QuantumIDEAgentPipelineMode = 'auto' | 'lite' | 'full';

export const QUANTUMIDE_LITE_AGENT_CONTEXT_BUDGET_MS = 200;

/** AC-03-02 / PL-02: not exposed or executed on Lite pipeline turns. */
export const QUANTUMIDE_LITE_PIPELINE_BLOCKED_SEMANTIC_TOOLS = ['search_semantic_workspace'] as const;

export function isQuantumIDEHostToolAllowedForPipeline(
	toolName: string,
	pipeline: QuantumIDEAgentPipeline | undefined,
): boolean {
	if (pipeline !== 'lite') {
		return true;
	}
	return !QUANTUMIDE_LITE_PIPELINE_BLOCKED_SEMANTIC_TOOLS.includes(toolName as typeof QUANTUMIDE_LITE_PIPELINE_BLOCKED_SEMANTIC_TOOLS[number]);
}

export function filterOpenAIHostToolsForPipeline<T extends { function: { name: string } }>(
	tools: readonly T[],
	pipeline: QuantumIDEAgentPipeline | undefined,
): readonly T[] {
	if (pipeline !== 'lite') {
		return tools;
	}
	return tools.filter(tool => isQuantumIDEHostToolAllowedForPipeline(tool.function.name, pipeline));
}

export function formatQuantumIDELitePipelineSemanticToolBlocked(toolName: string): string {
	return [
		`${toolName} is unavailable on the Lite agent pipeline (AC-03-02).`,
		'Use `search_workspace_text`, `file_search`, `list_workspace_directory`, or `read_workspace_file` instead.',
	].join(' ');
}

export function pipelineForQuantumIDEAgentIntent(intent: QuantumIDEAgentIntent): QuantumIDEAgentPipeline {
	switch (intent) {
		case 'fs_simple':
			return 'lite';
		case 'search_only':
			return 'standard';
		default:
			return 'full';
	}
}

export function getQuantumIDEFullAgentPipelineSystemAddon(): string {
	return [
		'',
		'QuantumIDE **Full agent pipeline** is active (@codebase / semantic retrieval).',
		'Use `search_semantic_workspace`, `search_workspace_text`, and full workspace context as needed.',
	].join('\n');
}

export function getQuantumIDELiteAgentPipelineSystemAddon(): string {
	return [
		'',
		'QuantumIDE **Lite agent pipeline** is active for this turn.',
		'Answer with read/list/exists tools only; `search_semantic_workspace` is disabled for Lite turns.',
		'Prefer `list_workspace_directory`, `read_workspace_file`, and fast-path structural checks for existence questions.',
	].join('\n');
}
