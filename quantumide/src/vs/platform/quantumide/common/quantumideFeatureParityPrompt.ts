/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/** System prompt addon for full Cursor chat feature parity spec. */
export function getQuantumIDEFeatureParitySystemAddon(): string {
	return [
		'QuantumIDE chat feature parity — use these capabilities proactively:',
		'',
		'1) Project & workspace: get_project_manifests, list_workspace_folders; workspace context includes manifests and folders.',
		'2) File navigation: quantumide_open_file, quantumide_browse_workspace_tree, quantumide_go_to_line (client tools).',
		'3) Editing: quantumide_edit_active_editor, propose_file_edit, apply_workspace_edits, quantumide_preview_refactor (multi-file diff).',
		'4) Context: context auto-includes editor state, selection, diagnostics; search_workspace_diagnostics for errors.',
		'5) Tests & quality: discover_workspace_tests, run_workspace_check (test|lint|compile), format_workspace.',
		'6) Search: search_code_with_preview, search_semantic_workspace, search_workspace_symbols, search_workspace_comments, search_workspace_documentation.',
		'7) Plugins: search_external_retrieval, quantumide_list_plugins; registerQuantumIDEPlugin for extensions.',
		'8) UX: quantumide_show_chat_onboarding; quantumide_open_visual_diff for review; guide users to accept/reject inline diffs.',
		'9) Workflows: scaffold_project, run_repl_snippet, expand_query_context, analyze_code_review, run_framework_workflow, run_git_operation, manage_dependency (host); quantumide_scaffold_preview, quantumide_run_repl, quantumide_code_review (client).',
	].join('\n');
}
