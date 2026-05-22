# QuantumIDE Agent Velocity

Agent Velocity reproduces Cursor-style speed accelerators inside QuantumIDE’s OpenAI-compatible agent: default workspace context, rules, parallel read-only tools, batch search, local verify, multi-root search, and handoff/resume.

## Settings

| Setting | Default | Purpose |
|---------|---------|---------|
| `quantumide.ai.agent.velocityProfile` | `dev` | `dev` = explore fast; `ship` = verify before claiming done |
| `quantumide.ai.agent.velocity.attachWorkspaceContext` | `true` | Project graph + diagnostics + SCM each turn |
| `quantumide.ai.agent.velocity.attachRules` | `true` | `AGENTS.md` + `.quantumide/rules/*.md` |
| `quantumide.ai.agent.velocity.parallelHostTools` | `true` | Parallel read-only host tools per round |
| `quantumide.ai.agent.velocity.crossRootSearch` | `true` | Search linked roots from `workspace-links.json` |
| `quantumide.ai.agent.velocity.handoffEnabled` | `true` | Write `.quantumide/agent-handoff.md` after turns |

## Workspace files

### `.quantumide/rules/`

Markdown rule files merged into agent context when `attachRules` is enabled.

### `.quantumide/workspace-links.json`

```json
{
  "version": 1,
  "roots": [
    { "name": "FocusForge", "path": "/absolute/path/to/StillnessCompiler" }
  ]
}
```

| Field | Meaning |
|-------|---------|
| `name` | **Display name** used in agent prompts, @ mentions (`FocusForge/src/foo.ts`), and cross-root resolution (MP-06). May differ from the on-disk folder name in VS Code. |
| `path` | Canonical absolute `fsPath` for the linked root. |

Enables cross-root `search_workspace_text` / `search_workspace_text_batch` when `crossRootSearch` is on.

### `.quantumide/agent-handoff.md`

Written after each completed agent turn (when handoff is enabled). Resume with **QuantumIDE: Resume Agent Handoff**.

### `.quantumide/agent-tasks.json`

Updated automatically when the assistant reply includes markdown checklist items (`- [ ] …`). Also stored in session config as `taskChecklist` for the next turn.

```json
{ "tasks": ["Implement batch search", "Add tests"], "updatedAt": 0 }
```

## Host tools

| Tool | Description |
|------|-------------|
| `search_workspace_text` | Ripgrep (or scan fallback); optional multi-root |
| `search_workspace_text_batch` | Parallel queries in one call |
| `file_search` | Cursor parity alias — fuzzy path search (`search_workspace_files`) |
| `search_workspace_files` | Fuzzy file path discovery |
| `list_workspace_directory` | List directory entries (respects ignore files) |
| `search_semantic_workspace` | Semantic index + text fallback; `target_directories` globs |
| `read_workspace_file` | Read with optional line range; large files stream first 512KB |
| `list_workspace_symbols` | Lightweight symbol list |
| `run_workspace_check` | `compile` → `npm run compile`; `verify` → `scripts/agent-verify.sh`; `custom` → script path |

## Commands

- **QuantumIDE: Pin Active File as Agent Task Spec** — pins the active editor file for every turn.
- **QuantumIDE: Resume Agent Handoff** — opens chat with the last handoff note.

## Verify script

`scripts/agent-verify.sh` runs the project compile gate (uses `ensure-node22.sh` when present).

## Profiles

- **dev** — batch search, parallel reads, `run_workspace_check` with `compile` after substantive edits.
- **ship** — smaller diffs, `run_workspace_check` with `verify` before claiming work is complete.
