/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

export function getQuantumIDEChatEightFeaturesPromptAddon(): string {
	return [
		'QuantumIDE chat eight-feature parity:',
		'1) LSP workspace rename: use client tool `rename` (vscode_renameSymbol) or `quantumide_lsp_workspace_rename` — preview by default, checkpoint before apply.',
		'2) Rich inline editing: `quantumide_show_inline_suggestion` with per-hunk accept/reject in editor.',
		'3) Editor manipulation: `quantumide_manipulate_editor` (cursor, selection, multi-cursor, reveal, open file).',
		'4) Open buffers: `quantumide_get_open_buffers` lists all tabs including dirty/untitled with content preview.',
		'5) Live collab: `quantumide_collab_sync` + buffer_patch relay when collab enabled (experimental; not full CRDT).',
		'6) Plugins: `quantumide_invoke_plugin` for registered QuantumIDE plugin tools.',
		'7) Terminal/palette: `quantumide_execute_workbench_command`, `quantumide_run_terminal_command` (output in chat).',
		'8) Unsaved buffers: `quantumide_read_unsaved_buffer` / `quantumide_write_unsaved_buffer` for dirty editor state.',
	].join('\n');
}
