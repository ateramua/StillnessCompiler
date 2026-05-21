/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/** §7 backend/workflow parity catalog for agent system prompts. */
export const QUANTUMIDE_AGENT_PARITY_CATALOG = [
	'Workspace search: semantic, symbol, vector, comments, diagnostics, unified search',
	'Navigation: go to definition/implementation/references, workspace symbol, browse tree',
	'Edits: propose_file_edit, apply_workspace_edits/patch, stage_chat_edits, active editor insert/replace',
	'Refactor: rename_symbol (LSP workspace), extract/move module, framework migrate, preview_refactor',
	'Quality: run_workspace_check (compile/lint/test/verify), format_workspace, discover_workspace_tests',
	'Review: analyze_code_review, open_visual_diff, merge_conflict resolution',
	'Scaffold: scaffold_project, generate_test_scaffold, manage_dependency',
	'Git: run_git_operation (status/diff/stage/commit/branch/push with policy)',
	'Terminal: run_terminal_cmd (sandbox), run_repl_snippet',
	'Context: expand_query_context, get_editor_state, get_project_manifests, dependency graph',
	'Batch: parallel host tools, execution graph, restore_workspace_checkpoint',
	'Collab: quantumide_collab_sync when enabled',
	'UI: execute_workbench_command, list_matching_commands, show_inline_suggestion, run_code_preview',
	'Plugins: extension-registered QuantumIDE plugins with enable/disable in settings',
] as const;

export function getQuantumIDEAgentParityCatalogAddon(): string {
	return [
		'QuantumIDE maintains full Cursor Chat backend parity. Available capabilities include:',
		...QUANTUMIDE_AGENT_PARITY_CATALOG.map(c => `- ${c}`),
	].join('\n');
}
