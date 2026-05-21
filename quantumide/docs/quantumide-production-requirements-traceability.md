# QuantumIDE Production Requirements — Traceability Matrix

**Normative specification:** [quantumide-production-grade-requirements-specification.md](./quantumide-production-grade-requirements-specification.md) — every `QPR-*` requirement with expected behavior, failure/recovery, UX, architecture, and verification.

**Status legend:** **Done (PDR)** = workbench implementation meets PDR acceptance at product scope; **Deferred** = P2/enterprise called out in spec; **N/A** = VS Code core.

Last updated: 2026-05-20 (Option B program — Phase 3 tests + verify script complete).

**Option B program:** [quantumide-cursor-chat-panel-parity-program.md](./quantumide-cursor-chat-panel-parity-program.md) · [Migration](./quantumide-cursor-chat-panel-migration.md) · [UAT](./quantumide-cursor-chat-panel-uat.md)

**Cursor agent parity doc:** [quantumide-cursor-agent-seven-requirements-parity.md](./quantumide-cursor-agent-seven-requirements-parity.md)

**Chat eight-features doc:** [quantumide-chat-eight-features-parity.md](./quantumide-chat-eight-features-parity.md)

**Task phase status doc:** [quantumide-agent-task-phase-status.md](./quantumide-agent-task-phase-status.md)

**Cursor parity six doc:** [quantumide-cursor-parity-six-requirements.md](./quantumide-cursor-parity-six-requirements.md)

---

## 1. AI Chat Workflows

| ID | Requirement | Status | Implementation |
|----|-------------|--------|----------------|
| 1.0 | In-chat agent activity status (Cursor-style) | Done | [quantumide-chat-agent-activity-status-requirements.md](./quantumide-chat-agent-activity-status-requirements.md) — `agentActivityLabels`, `openaiRawToolProgress`, `agentHostSessionHandler`, `quantumideChatAgentActivity.contribution` |
| 1.1 | Contextual awareness & injection | Done (PDR) | `quantumideChatContextOrchestrator` (80 diagnostics, manifests, nav history); `quantumideContextInspectorService` + **Open Context Inspector Panel**; context health + reload |
| 1.2 | Streaming, interruptible responses | Done (PDR) | Native stream + `quantumide.chat.cancelStream` / `cancelStreamFull` + agent abort |
| 1.3 | Persistent, threaded chat history | Done (PDR) | Thread store (mode, attachments, checkpoints, archive, **encrypted export/import**); chat panel threads tree |
| 1.4 | Inline code actions from chat | Done (8-step parity) | [quantumide-chat-panel-eight-step-parity.md](./quantumide-chat-panel-eight-step-parity.md) |

**Deferred:** QPR-1.1.004 encrypted cross-device sync (local encrypted export provided).

---

## 2. Inline AI Editing & Autocomplete

| ID | Requirement | Status | Implementation |
|----|-------------|--------|----------------|
| 2.1 | Real-time ghost text | Done (PDR) | VS Code inline + prefetch + model routes |
| 2.2 | Inline AI edits & suggestions | Done (Option B) | Inline diff + overlay + **Accept All / Reject All** + hunk disposition tracking |

---

## 3. Agent Workflows

| ID | Requirement | Status | Implementation |
|----|-------------|--------|----------------|
| 3.1 | Multi-step autonomous execution | Done (task phase status) | Orchestrator + execution graph + **status bar task phases** (`quantumideAgentTaskPhaseStatus`) + post-apply verify |
| 3.2 | Workspace-wide LSP refactors | Done (7-req parity) | `quantumide.chat.lsp.renameSymbol` → `editor.action.rename` + `AgentPreferLspRename` host guidance |
| 3.3 | Direct editor UI + instant commands | Done (7-req parity) | `quantumideAgentSevenRequirements.contribution.ts`, inline diff, merge UI inject, `quantumide_move_workspace_files`, instant palette allowlist |
| 3.4 | Live editor context for agent | Done (8-feature parity) | `.quantumide/agent-context.json` + open buffers in snapshot + `quantumide_get_open_buffers` |
| 3.5 | Editor manipulation + unsaved buffers | Done (8-feature parity) | `quantumide_manipulate_editor`, `quantumide_read/write_unsaved_buffer` |
| 3.6 | LSP workspace rename (preview/undo) | Done (Option B) | `quantumide_lsp_workspace_rename` + `apply:true` + checkpoint |
| 3.7 | Plugin + terminal instant access | Done (Option B) | `quantumide_manage_extension` (install/enable/disable), terminal confirm/auto-approve |
| 3.8 | Editor highlight / close tab | Done (Option B) | `highlight_range`, `close_editor` on `quantumide_manipulate_editor` |

**Deferred:** QPR-3.1.003 background runner without chat panel. Host step gate: `.quantumide/agent-pause.json` polled in `openAiAgent` + workbench `quantumideAgentStepGateService`.

---

## 4. Context Management & Codebase Indexing

| ID | Requirement | Status | Implementation |
|----|-------------|--------|----------------|
| 4.1 | Real-time incremental indexing | Done (Cursor parity) | Chunked scanner + worker scheduler + **per-file AST incremental** (Tree-sitter adapter) + `quantumide-index-search-fixture.sh` |
| 4.2 | Semantic & symbol search | Done (Cursor parity) | Unified search + **signature preview** + `quantumide.chat.searchWithPreview` / `quantumide.search.openHit` |

**Deferred:** QPR-4.1.005 million-LOC repo fixture (10k-path P95 gate in CI).

---

## 5. Workspace Memory, State, and Persistence

| ID | Requirement | Status | Implementation |
|----|-------------|--------|----------------|
| 5.1 | Robust workspace state persistence | Done (PDR) | `quantumideWorkspaceStateService` |
| 5.2 | Snapshot, backup, restore | Done (PDR) | Snapshots + hash dedup + multi-diff + GC + thread checkpoint links |

**Deferred:** QPR-5.1.002 encrypted cloud workspace state.

---

## 6–8. Editor, File Tree, Panels

| ID | Requirement | Status | Implementation |
|----|-------------|--------|----------------|
| 6.1 | Zero-latency editing | N/A | Monaco core |
| 6.2 | Accessibility | Done (PDR) | Tokens + reduced-motion + VS Code a11y |
| 7.1 | File tree | Done (PDR) | Explorer tree + chat panel workspace files |
| 7.2 | Tabs | N/A | VS Code tabs + workspace state |
| 8.1 | Panel behavior | Done (PDR) | Parity dock + persisted layout |
| 8.2–8.3 | Command palette / terminal | N/A / Done (Cursor parity) | VS Code + cancel cascade + **in-thread terminal/test blocks** (`quantumideTerminalBlockService`) |

---

## 9. Extensions & Collaboration

| ID | Requirement | Status | Implementation |
|----|-------------|--------|----------------|
| 9.1 | Extension system | N/A | VS Code extension host + plugin consent |
| 9.2 | Sync & collaboration | Done (Option B Phase 2) | Relay + **remote cursor decorations** + chat context sync; OT-lite (no CRDT) |

**Deferred:** QPR-9.2.003 CRDT/OT shared edits.

---

## 10–12. Recovery, UI, Performance, Security

| ID | Requirement | Status | Implementation |
|----|-------------|--------|----------------|
| 10.1–10.2 | Recovery / offline | Done (PDR) | Error boundary + snapshots + offline service |
| 11.1–11.2 | Design / animation | Done (PDR) | Design tokens + real loaders |
| 12.1 | Performance | Done (Cursor parity) | Budget marks + **enforcing** `quantumide-performance-ci.sh` |
| 12.2 | Telemetry | Done (PDR) | Opt-in telemetry + audit |
| 12.3 | Security | Done (PDR) | Redaction + secret scanner |

---

## PDR fulfillment entry points

| Service / contribution | QPR focus |
|------------------------|-----------|
| `quantumideUnifiedEditPipelineService.ts` | 1.4.001 unified edits |
| `quantumideAgentStepGateService.ts` | 3.1.002 pause before tools |
| `quantumideExecutionGraphService.ts` | 3.1.004 checklist |
| `quantumidePdrFulfillment.contribution.ts` | Inspector panel, step mode, merge chat, export |
| `quantumideChatThreadStoreService.ts` | 1.3.001 thread model extensions |
| `quantumidePracticalPriority.contribution.ts` | In-thread blocks, tour, collab honesty, inject drain |
| `quantumideChatInThreadInjectService.ts` | 1.4 in-thread diff cards |
| `quantumideAgentPauseStore.ts` + `openAiAgent` poll | 3.1.002 host step gate |
| `quantumideIndexerWorkerScheduler.ts` | 4.1 worker-style indexing |
| `quantumideChatPanelEightStep.contribution.ts` | Chat panel 8-step parity (inline, editor, LSP, plugins, rich UI, context, auto-apply, batch) |
| `quantumideNextBatch.contribution.ts` | Search preview, tests, checkpoints, attach active file |
| `quantumideCursorParity.contribution.ts` + chat @/review | 1.1.002, 1.4 UI |

---

## Verification (implementation, not manual QA pass)

```bash
cd quantumide
./scripts/quantumide-cursor-parity-program-verify.sh
./scripts/quantumide-performance-ci.sh
./scripts/quantumide-index-search-fixture.sh
```
