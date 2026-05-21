# QuantumIDE Chat — Eight Features Parity

Production implementation for the eight Cursor Chat Panel capabilities not previously covered end-to-end.

| # | Feature | Status | Implementation |
|---|---------|--------|----------------|
| 1 | Workspace-wide LSP rename | Done | `IQuantumIDEWorkspaceRenameService` + `quantumide_lsp_workspace_rename` + `rename` (`vscode_renameSymbol`) + snapshot checkpoint |
| 2 | Rich inline editing | Done | `IQuantumIDEInlineDiffService` per-hunk accept/reject + side-by-side preview |
| 3 | Direct editor manipulation | Done | `IQuantumIDEEditorManipulationService` + `quantumide_manipulate_editor` |
| 4 | All open files/tabs | Done | `IQuantumIDEOpenBuffersService` + `quantumide_get_open_buffers` + agent-context snapshot |
| 5 | Live collaboration | Partial (experimental) | Presence + `IQuantumIDECollabLiveEditService` line patches via collab messages; not full OT/CRDT |
| 6 | Extensions/plugins | Done | `IQuantumIDEPluginBridgeService` + `quantumide_invoke_plugin` |
| 7 | Terminal/command palette | Done | `quantumide_run_terminal_command` + instant `quantumide_execute_workbench_command` |
| 8 | Unsaved editor state | Done | `IQuantumIDEUnsavedBufferService` + read/write tools |

## Client tools (require `quantumide.chat.cursorParity.enabled`)

- `quantumide_lsp_workspace_rename`
- `quantumide_manipulate_editor`
- `quantumide_get_open_buffers`
- `quantumide_read_unsaved_buffer` / `quantumide_write_unsaved_buffer`
- `quantumide_invoke_plugin`
- `quantumide_run_terminal_command`

## Honest limits

- **Collab (§5):** Relay + encrypted session files + line-level patches; not production OT/CRDT multi-user editing.
- **Rename (§1):** Depends on installed language server rename providers; conflicts/readonly files surface LSP errors.
- **Performance (§1 NFR):** Large workspaces depend on LSP; 2s target is best-effort.

## Related docs

- [quantumide-cursor-agent-seven-requirements-parity.md](./quantumide-cursor-agent-seven-requirements-parity.md)
- [quantumide-chat-panel-eight-step-parity.md](./quantumide-chat-panel-eight-step-parity.md)
