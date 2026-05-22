/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { isQuantumIDEPluginHostTool } from './quantumidePluginRegistry.js';

export type QuantumIDEAgentVelocityProfile = 'dev' | 'ship';

export const QUANTUMIDE_RULES_DIR = '.quantumide/rules';
export const QUANTUMIDE_WORKSPACE_LINKS_FILE = '.quantumide/workspace-links.json';
export const QUANTUMIDE_AGENT_HANDOFF_FILE = '.quantumide/agent-handoff.md';
export const QUANTUMIDE_AGENT_TASKS_FILE = '.quantumide/agent-tasks.json';
export const QUANTUMIDE_PINNED_TASK_SPEC_STORAGE_KEY = 'quantumide.agentVelocity.pinnedTaskSpecUri';

export const READONLY_OPENAI_HOST_TOOLS = new Set<string>([
	'search_workspace_text',
	'search_workspace_text_batch',
	'read_workspace_file',
	'list_workspace_symbols',
	'search_workspace_symbols',
	'find_symbol_references',
	'resolve_import_dependencies',
	'search_semantic_workspace',
	'search_vector_workspace',
	'list_workspace_directory',
	'search_workspace_files',
	'query_dependency_graph',
	'find_implementations',
	'normalize_imports',
	'rewrite_imports',
	'lookup_type_hierarchy',
	'search_architectural_patterns',
	'suggest_dependent_files',
	'list_workspace_folders',
	'get_project_manifests',
	'discover_workspace_tests',
	'search_code_with_preview',
	'search_workspace_documentation',
	'search_workspace_comments',
	'search_workspace_diagnostics',
	'expand_query_context',
	'analyze_code_review',
	'run_repl_snippet',
]);

export function isReadOnlyOpenAIHostTool(toolName: string): boolean {
	return READONLY_OPENAI_HOST_TOOLS.has(toolName) || isQuantumIDEPluginHostTool(toolName);
}

export function getAgentVelocityProfileSystemAddon(profile: QuantumIDEAgentVelocityProfile): string {
	if (profile === 'ship') {
		return [
			'',
			'Agent Velocity (ship profile):',
			'- Apply file changes with `apply_workspace_edits` in one call; do not run full-repo compile unless the user asks or you edited TypeScript/JavaScript sources.',
			'- Use `search_workspace_text_batch` for multiple search terms in one round instead of serial greps.',
			'- Read only the files you need; avoid broad directory scans and extra tool rounds.',
		].join('\n');
	}
	return [
		'',
		'Agent Velocity (dev profile):',
		'- Explore quickly: batch searches, parallel reads, and `run_workspace_check` with check `compile` after substantive edits.',
		'- Use workspace rules and pinned task specs when present; update `.quantumide/agent-handoff.md` mental model via tools, not prose-only claims.',
		'- Finish multi-step tasks without stopping for permission between read-only exploration steps.',
	].join('\n');
}
