# QuantumIDE Workflow Optimization — Development Requirements

Implementation status: **Done** (2026-05-21). Settings, host tools, agent prompts, indexing gate, deferred verification command, and tests are wired in-tree.

## Overview

Seven workflow optimizations improve developer responsiveness when the agent applies file and project changes. This document is the normative handoff spec; see [quantumide-production-requirements-traceability.md](./quantumide-production-requirements-traceability.md) for QPR mapping.

---

## 1. Enable Auto-Apply for Edits

| Item | Detail |
|------|--------|
| Setting | `quantumide.ai.agent.autoApplyEdits` (boolean, **default: false**) |
| Behavior | When **true**, `apply_workspace_edits` / `apply_workspace_patch` apply immediately. When **false**, edits are proposed for review. |
| Safety | `quantumide.ai.agent.requireConfirmationForFileDelete` (default **true**) still blocks deletes without confirmation. |
| Implementation | `openaiHostTools.ts` (`applyWorkspaceEdits`), `quantumideUnifiedEditPipelineService.ts`, `quantumideConfigurationDefaults.ts` |

---

## 2. Support Instant Palette Commands

| Item | Detail |
|------|--------|
| Setting | `quantumide.ai.agent.instantPaletteCommands` (requirements alias: *instantPaletteCommands*) |
| Product default | `autoApplyEdits` **true**, `fastApplyEdits` **true**, `verifyOnEdit` **defer** (avoids 10–20 min `npm run compile` after doc edits) |
| Safe commands | `quantumideAgentInstantCommands.ts` — format, organize imports, tests, merge navigation |
| Implementation | `quantumideChatParityTools.ts` / `execute_workbench_command` auto-confirm when enabled |

---

## 3. Limit or Defer Verification Steps

| Item | Detail |
|------|--------|
| Setting | `quantumide.ai.agent.verifyOnEdit`: `"always"` \| `"defer"` \| `"never"` (default: **always**) |
| always | Host runs `run_workspace_check` (compile) after successful `apply_workspace_edits` / patch / refactor tools |
| defer | Queue check in `.quantumide/deferred-verification.json`; user runs **QuantumIDE: Run Deferred Agent Verification** |
| never | Skip automatic verification; agent prompt documents manual checks |
| Implementation | `openAiAgent._maybeRunPostRefactorVerify`, `quantumideDeferredVerificationStore.ts`, `quantumideAgentWorkflowOptimizationService.ts` |

---

## 4. Prefer Direct Editor Edits for Small Changes

| Item | Detail |
|------|--------|
| Settings | `quantumide.ai.agent.preferDirectEditorEdits` (default **true**), `quantumide.ai.agent.directEditorMaxLines` (default **100**) |
| Behavior | Single-file writes under the line threshold return guidance to use `quantumide_show_inline_suggestion` / `quantumide_manipulate_editor` instead of full-file `apply_workspace_edits` |
| Override | Agent may still call `apply_workspace_edits` to force disk write |
| Implementation | `shouldPreferDirectEditorEdit()` in `quantumideWorkflowOptimization.ts` |

---

## 5. Batch Edits When Possible

| Item | Detail |
|------|--------|
| Tool | `apply_workspace_edits` — multiple operations in one call |
| Atomicity | `atomic: true` (default) — all succeed or rollback via checkpoints |
| Summary | `formatBatchApplySummary()` prepends human-readable batch trace |
| Auto-apply | Batch summary shown when `autoApplyEdits` is on; otherwise proposal text only |
| Implementation | `quantumideWorkspaceEdits.ts`, `openaiHostTools.applyWorkspaceEdits` |

---

## 6. Optimize Workspace Indexing

| Item | Detail |
|------|--------|
| Setting | `quantumide.ai.agent.waitForIndexingBeforeEdits` (default **false**) |
| Status file | `.quantumide/indexing-status.json` (written by `quantumideBackgroundIndexerService`) |
| Gate | `getIndexingGateMessage()` blocks `apply_workspace_edits` while indexing is busy when wait + semantic indexing enabled |
| Manual reindex | **QuantumIDE: Reindex Workspace** (`quantumide.ai.reindexWorkspace`) |
| Progress | Status bar spinner during background indexing |
| Implementation | `quantumideIndexingStatusStore.ts` |

---

## 7. Use LSP Rename for Symbol Refactors

| Item | Detail |
|------|--------|
| Setting | `quantumide.agent.preferLspRename` (default **true**) |
| Behavior | `rename_symbol` redirects to client `rename` / `quantumide_lsp_workspace_rename` with preview |
| Fallback | Single-file text rename only when `preferLspRename` is off and not `workspaceWide` |
| Implementation | `renameSymbolTool` in `openaiHostTools.ts`, `quantumide.chat.lsp.renameSymbol` command |

---

## Edit velocity (performance — primary control)

| Setting | `quantumide.ai.agent.editVelocity`: `safe` \| `fast` \| `maximum` |
| Product default | **`maximum`** |
| safe | Validation + checkpoints + read-before-write + formatting preservation |
| fast | No validation/checkpoints; skip read-before-write |
| maximum | Direct `writeFile`; single-file writes non-atomic; **compact agent prompt**; docs paths always maximum |

`docs/*.html`, `docs/*.md`, and user-guide paths automatically use **maximum** even when the global setting is `fast`.

## Fast apply (legacy)

| Setting | `quantumide.ai.agent.fastApplyEdits` — maps to `fast` when `editVelocity` unset |

---

## Acceptance criteria

- [x] All seven optimizations implemented and independently configurable
- [x] Settings in QuantumIDE AI configuration UI (`quantumideAI.contribution.ts`)
- [x] Agent system prompt addon (`getWorkflowOptimizationSystemAddon`)
- [x] Unit tests: `quantumideWorkflowOptimization.test.ts`
- [x] No loss of delete confirmation or dangerous-command policies

---

## Verification

```bash
cd quantumide
./scripts/ensure-node22.sh npm run compile-check-ts-native
./scripts/ensure-node22.sh npm run transpile-client
./scripts/ensure-node22.sh node test/unit/node/index.js --runGlob "**/quantumideWorkflowOptimization.test.js"
```

---

**End of Requirements Document**
