# QuantumIDE AI — Cursor Agent 7 Requirements Parity

Implementation pass for the **QuantumIDE AI Development Requirements for Full Cursor Chat Panel Parity** (7 sections).

## 1. Direct Editor UI Manipulation

| Requirement | Implementation |
|-------------|----------------|
| 1.1 Inline accept/reject | `IQuantumIDEInlineDiffService` + chat inject (`injectInlineSuggestionBar`, `injectLiveRefactorPreview`) + tools `quantumide_show_inline_suggestion` |
| 1.2 Live inline refactor previews | Inline diff side-by-side (`QuantumIDEAICommandId.InlineDiffSideBySide`), bridge in `quantumideAgentSevenRequirements.contribution.ts` |
| 1.3 Drag-and-drop file ops | `IQuantumIDEFileExplorerTreeService.moveEntries` + `quantumide_move_workspace_files` tool + `quantumide.chat.moveFiles` command |
| 1.4 Visual merge conflict resolution | `IQuantumIDEMergeConflictService` + in-chat `injectMergeConflictUi` + `quantumide.chat.openMergeConflictUi` |

## 2. Workspace-Wide LSP Symbol Rename

- `quantumide.chat.lsp.renameSymbol` → `editor.action.rename` (LSP workspace rename when language server supports it).
- Host guidance: `AgentPreferLspRename` in `openAiAgent` system prompt.

## 3. Immediate Context from Editor State

- `IQuantumIDEEditorStateService` + `quantumide_get_editor_state` tool.
- `IQuantumIDEAgentContextSnapshotService` writes `.quantumide/agent-context.json`.
- Host injects snapshot summary into system prompt when `AgentEditorContextSnapshot` is enabled.

## 4. Real-Time Collaborative Editing

- `IQuantumIDECollaborationService` + relay/BroadcastChannel (experimental).
- Presence pulse every 3s when `ChatSyncRealtime` is on (`quantumideCollaborationPresence.contribution.ts`).
- In-chat `injectCollabLiveStatus` when session changes.

**Honest limit:** Not full CRDT/OT multi-cursor editing; shared session + presence + encrypted JSON sync.

## 5. Rich UI Interactions

- `IQuantumIDEAgentUiParityService`: split editors, multi-diff review.
- Commands: `quantumide.chat.splitEditorRight`, `quantumide.chat.splitEditorDown`.
- `quantumide_open_visual_diff` + `ChatDiffSideBySide` setting.

## 6. Immediate Command Palette Actions

- Setting: `quantumide.ai.agent.instantPaletteCommands` (default true).
- Allowlist: `quantumideAgentInstantCommands.ts`.
- `quantumide_execute_workbench_command` auto-confirms safe commands when instant mode is on.

## 7. Backend and Workflow Parity

- Catalog: `quantumideAgentParityCatalog.ts` appended to `getQuantumIDECursorParitySystemAddon()`.
- All existing host tools unchanged (search, edits, git, terminal, scaffold, checkpoints).

## Key files

- `quantumideAgentSevenRequirements.contribution.ts`
- `quantumideAgentContextSnapshotService.ts` / `quantumideAgentContextSnapshotStore.ts`
- `quantumideAgentUiParityService.ts`
- `quantumideAgentInstantCommands.ts`
- `quantumideChatInThreadInjectService.ts` (merge/refactor/collab injectors)
- `quantumideChatParityTools.ts` (move files tool, instant command confirm)

## Settings

| Setting | Default | Purpose |
|---------|---------|---------|
| `quantumide.ai.agent.instantPaletteCommands` | true | Auto-approve safe palette commands |
| `quantumide.ai.agent.editorContextSnapshot` | true | Live `.quantumide/agent-context.json` |
| `quantumide.agent.preferLspRename` | true | LSP workspace rename guidance |
| `quantumide.chat.collab.enabled` | true | Collaboration session + presence |
