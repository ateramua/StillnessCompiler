# QuantumIDE workspace discovery — security notes

## SEC-04 — Agent host and OS permissions

QuantumIDE agent tools (`read_workspace_file`, `search_workspace_text`, `apply_workspace_edits`, terminal tools) run in the **agent host process with your user account’s file-system permissions**. They are not sandboxed below the OS user.

- A trusted workspace can still read any path the tools resolve under configured roots (and linked roots when cross-root search is enabled).
- Ignored paths (`.quantumideignore`, `.cursorignore`, secrets list) block indexing, @ mentions, and agent reads — but cannot override OS-level access if another tool passes an absolute path outside policy.
- Use **Workspace Trust** for folders you do not fully trust; keep `quantumide.ai.indexing.enabled` off in untrusted workspaces.

## Read-only workspace (SEC-05)

When VS Code marks the workspace or file provider as read-only, agent **discovery** tools (`search_workspace_text`, `read_workspace_file`, symbols, etc.) still run. **File-mutating** host tools (`apply_workspace_edits`, `apply_workspace_patch`, scaffold/git/dependency tools, `format_workspace`, auto-applied refactors) return a clear error: workspace is read-only — no partial writes.

## Ignore files (SEC-06)

| File | Scope |
|------|--------|
| `quantumide.ai.ignoreFile` (default `.quantumideignore`) | **Unified** — indexing, @ mentions, and agent tools |
| `.quantumideindexingignore` | Indexing-only additions |
| `.cursorignore` | Merged into AI + index (Cursor parity) |

Configure the unified path per workspace: **Settings → QuantumIDE → Indexing → Ignore file**.
