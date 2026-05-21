# Migrating from Cursor Chat Panel to QuantumIDE AI

This guide maps Cursor Chat Panel workflows to QuantumIDE equivalents implemented in the **Option B parity program**.

## Feature mapping

| Cursor | QuantumIDE |
|--------|------------|
| Workspace rename | Chat: “Rename symbol X to Y in file Z” → tool `quantumide_lsp_workspace_rename` (preview by default; `apply: true` to commit) |
| Inline diff accept/reject | Editor overlay + commands **Accept All / Reject All Inline AI Diff Hunks** |
| Go to file / highlight | Tool `quantumide_manipulate_editor` (`open_file`, `highlight_range`, `reveal_line_center`) |
| Install extension | Tool `quantumide_manage_extension` with `operation: install` |
| Run terminal command | Tool `quantumide_run_terminal_command` (confirm in chat unless auto-approve settings on) |
| Live share / collab | Commands **Start/Join collaboration session**; enable `quantumide.chat.collab.enabled` |

## Settings to configure

| Setting | Recommended |
|---------|-------------|
| `quantumide.chat.cursorParity.enabled` | `true` |
| `quantumide.ai.agent.autoApplyEdits` | `true` if you want Cursor-style auto-apply |
| `quantumide.terminal.autoApproveSafe` | `false` until you trust command allowlists |
| `quantumide.chat.collab.enabled` | `true` for experimental sessions |

## Collab expectations

QuantumIDE collaboration is **OT-lite** (encrypted session files, optional relay, presence cursors, line patches). It is **not** full CRDT multi-user editing like some cloud IDEs. For two-machine sync, configure collab relay URL in settings or use a shared workspace folder.

## Verification after migration

1. Run `./scripts/quantumide-cursor-parity-program-verify.sh`
2. Complete [quantumide-cursor-chat-panel-uat.md](./quantumide-cursor-chat-panel-uat.md)
