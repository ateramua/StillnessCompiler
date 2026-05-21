/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/** System prompt for Cursor Chat Panel six-requirement parity bundle. */
export function getQuantumIDECursorParitySixPromptAddon(): string {
	return [
		'Cursor parity six capabilities (enabled when configured):',
		'1) Auto-apply: when quantumide.ai.agent.autoApplyEdits is on, apply_workspace_edits, propose_file_edit, and patches apply without per-edit approval.',
		'2) Live inline: quantumide_show_inline_suggestion + editor overlay accept/reject controls.',
		'3) Full IDE: quantumide_execute_workbench_command, quantumide_update_setting, quantumide_manage_extension, full LSP via editor actions.',
		'4) Workspace rename: rename / quantumide_lsp_workspace_rename with preview.',
		'5) Collaboration: quantumide_collab_sync when collab enabled.',
		'6) Rich UI: editor assistant overlay, chat cards, in-thread diff review.',
	].join('\n');
}
