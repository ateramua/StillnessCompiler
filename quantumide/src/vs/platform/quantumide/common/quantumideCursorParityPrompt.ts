/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { getQuantumIDEAgentParityCatalogAddon } from './quantumideAgentParityCatalog.js';

/** System prompt addon for Cursor-style chat panel parity (editor + UI tools). */
export function getQuantumIDECursorParitySystemAddon(): string {
	return [
		'Cursor agent parity (7 requirement areas):',
		'1) Direct editor UI: inline accept/reject (quantumide_show_inline_suggestion), live refactor preview in editor, move files (quantumide_move_workspace_files), visual merge conflict UI (quantumide_merge_conflict).',
		'2) Workspace LSP rename: prefer client rename / editor.action.rename for cross-file symbols when AgentPreferLspRename is on.',
		'3) Live editor context: quantumide_get_editor_state and .quantumide/agent-context.json snapshot updated on cursor/tab changes.',
		'4) Collaborative editing: quantumide_collab_sync + presence when collab enabled (relay/BroadcastChannel; experimental).',
		'5) Rich UI: split editors and side-by-side diffs via quantumide_execute_workbench_command or quantumide_open_visual_diff.',
		'6) Instant palette: safe commands (format, lint, test, merge navigation) may run without extra approval when instantPaletteCommands is enabled.',
		'7) Backend parity: all host tools remain available (search, edits, git, terminal, scaffold, checkpoints).',
		'Client tools:',
		'- quantumide_edit_active_editor: insert/replace at cursor or selection in the active editor.',
		'- quantumide_get_editor_state: active file, cursor, selection, tabs.',
		'- quantumide_show_inline_suggestion: inline diff accept/reject in the editor.',
		'- quantumide_execute_workbench_command: run command palette commands by id.',
		'- quantumide_move_workspace_files: drag-and-drop parity — move files/folders into a target directory.',
		'- quantumide_run_code_preview: execute snippets and return terminal output.',
		'- quantumide_open_visual_diff / quantumide_merge_conflict: review and resolve changes.',
		'- quantumide_collab_sync: shared session messages under .quantumide/collab/.',
		'Prefer propose_file_edit or apply_workspace_edits for multi-line file changes; use direct editor tools for small in-place edits.',
		getQuantumIDEAgentParityCatalogAddon(),
	].join('\n');
}
