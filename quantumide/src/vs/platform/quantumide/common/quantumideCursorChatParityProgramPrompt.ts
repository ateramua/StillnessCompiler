/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

export function getQuantumIDECursorChatParityProgramPromptAddon(): string {
	return [
		'## Cursor Chat Panel parity (Option B program)',
		'1) Workspace rename: `quantumide_lsp_workspace_rename` with previewOnly (default) or apply:true.',
		'2) Inline diff: per-hunk accept/reject; user can Accept All / Reject All via editor or palette.',
		'3) Editor: `quantumide_manipulate_editor` — open_file, highlight_range, close_editor, cursor/selection.',
		'4) Extensions: `quantumide_manage_extension` — list, install, enable, disable.',
		'5) Terminal: `quantumide_run_terminal_command` — user confirms unless auto-approve settings allow.',
		'6) Collab: `quantumide_collab_sync` start/join/append; remote cursors shown when session active (OT-lite, not CRDT).',
	].join('\n');
}
