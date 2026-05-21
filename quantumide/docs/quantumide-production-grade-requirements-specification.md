# QuantumIDE Production-Grade Requirements Specification

**Version:** 1.0  
**Status:** Normative — source of truth for Cursor-level (and exceeding) product quality  
**Supersedes:** informal summaries; complements [quantumide-production-requirements-traceability.md](./quantumide-production-requirements-traceability.md) (status matrix only)  
**References:** [ChatPanelRe-engineering.md](./ChatPanelRe-engineering.md) v2.0, [quantumide-cursor-level-gap-requirements.md](./quantumide-cursor-level-gap-requirements.md), [quantumide-chat-platform.md](./quantumide-chat-platform.md)  
**Audience:** All engineers implementing QuantumIDE workbench, agent host, indexing, editor, platform, and UX  
**Last updated:** 2026-05-20  

---

## 0. Document control

### 0.1 Purpose

This specification enumerates **every** missing, incomplete, inconsistent, underdeveloped, partially implemented, visually unpolished, architecturally weak, or behaviorally inaccurate feature, workflow, system, interaction, and UX pattern required for QuantumIDE to achieve **true feature parity with Cursor** and, where specified, **exceed** Cursor in cohesion, transparency, and safety.

It defines **precise expected final behavior**, failure modes, recovery paths, latency targets, persistence guarantees, and implementation constraints. The traceability matrix records **Done / Partial / Planned** per clause; **this document defines what “Done” means.**

### 0.2 Requirement ID scheme

| Prefix | Meaning |
|--------|---------|
| `QPR-{section}.{clause}.{seq}` | Production requirement (normative) |
| `QPR-G.{seq}` | Global cross-cutting requirement |
| `QPR-NFR-{area}` | Non-functional requirement template reference |

Example: `QPR-1.2.003` = Section 1 (AI Chat), clause 1.2 (Streaming), third requirement.

### 0.3 Severity

| Label | Definition |
|-------|------------|
| **P0** | Ship blocker: misleading UX, data loss risk, security hole, or core workflow non-functional |
| **P1** | Core Cursor parity gap; power users hit within first session |
| **P2** | Polish, scale proof, enterprise, or exceed-Cursor quality bar |

### 0.4 Current-state legend (used in every requirement)

| State | Meaning |
|-------|---------|
| **MISSING** | Not implemented |
| **STUB** | Agent-callable or file-based; no production user-visible behavior |
| **PARTIAL** | Real code path exists; gaps listed in *Current defects* |
| **BROKEN** | Implemented but incorrect vs spec |
| **INCONSISTENT** | Behavior differs by surface (chat vs dock vs command vs tool) |
| **DELEGATED** | Relies on VS Code core without QuantumIDE augmentation |
| **DONE** | Meets acceptance criteria in this document (verify via traceability) |

### 0.5 Developer mandate (binding)

Implementers **must not**:

- Ship **placeholders**, **mocks**, **hardcoded** demo paths, or **notification-only** flows where this spec requires UI.
- Use **polling-only** or **manual refresh** where spec requires continuous sync.
- Label features “collaboration,” “real-time,” or “LSP refactor” when implementation is file-handoff, regex, or JSON sync.
- Use **fake loading states** (spinners with no backing work) or **simulated AI** where production model/host paths exist.
- Split **edit review UX** across incompatible surfaces (`propose_file_edit` vs `stage_chat_edits` vs dock-only) without unified pipeline (QPR-1.4.x, QPR-3.2.x).
- Cap indexing at 500 files without **background worker**, **progress**, and **usable partial index** (QPR-4.1.x).
- Skip **automated acceptance** where *Verification* column requires it.

Implementers **must**:

- Match **Cursor desktop Chat + Agent** behavior (2024–2026) unless *Intentional divergence* is documented with product approval.
- Wire **end-to-end**: UI → service → persistence → recovery → telemetry.
- Meet **latency budgets** in §0.7 or requirement-specific overrides.
- Update traceability + `quantumide-chat-platform.md` on each **Done** closure.

### 0.6 Requirement record template

Every `QPR-*` requirement includes:

1. **Title** — user-visible capability  
2. **Priority** — P0/P1/P2  
3. **Current state** — MISSING | STUB | PARTIAL | …  
4. **Current defects** — what is wrong today (files/behavior)  
5. **Expected behavior** — normative description  
6. **Failure behavior** — graceful degradation  
7. **Recovery behavior** — user and system recovery paths  
8. **UX polish** — loading, empty, error, motion, density  
9. **Architecture** — services, boundaries, persistence, concurrency  
10. **Scalability & maintainability**  
11. **Consistency** — cross-surface rules  
12. **Performance / security / a11y** — when applicable  
13. **Acceptance criteria** — testable definition of Done  
14. **Verification** — automated + manual  

Global defaults apply when a field says *inherits QPR-G*.

### 0.7 Global latency & responsiveness budgets (QPR-G.001)

| Interaction | P95 target | P99 max | Measurement |
|-------------|------------|---------|-------------|
| Keystroke → editor paint | ≤16ms | ≤33ms | Core Monaco (DELEGATED); QuantumIDE overlays must not add >4ms P95 |
| Chat panel open (warm) | ≤1500ms | ≤2500ms | `ChatStartup` mark |
| Context rebuild (standard profile, ≤500 files) | ≤200ms | ≤500ms | `ChatContextBuild` mark |
| Context rebuild (enterprise 10k files, incremental) | ≤2000ms | ≤5000ms | Must not block UI thread |
| Semantic retrieval (warm index) | ≤300ms | ≤600ms | `runWithBudget` |
| Inline completion request → first ghost text | ≤200ms | ≤400ms | `InlineCompletion` mark |
| Diff card render (single file, <500 LOC) | ≤100ms | ≤200ms | UI mark |
| Incremental index after single file save | ≤2000ms | ≤5000ms | File watcher → searchable |
| Cancel streaming chat | ≤100ms | ≤250ms | User perceived stop |
| Parity dock section refresh | ≤50ms | ≤120ms | After observable event |
| Snapshot create (medium workspace) | ≤3000ms | ≤8000ms | Async; UI non-blocking |
| Agent tool approval card appear | ≤150ms | ≤300ms | After host proposal |

**Enforcement:** CI job `quantumide-performance-ci` fails PR if P95 exceeds budget by >20% on fixture repo (QPR-12.1.002).

### 0.8 Global failure & recovery (QPR-G.002)

- **Network/model failure:** Chat shows structured error with Retry, Edit message, Switch model; no silent hang; partial assistant message preserved with “incomplete” badge.
- **Service crash:** Subsystem restarts via workbench lifecycle; last workspace state restored from QPR-5.1.x; user notified once per session.
- **Disk full:** Snapshot/state writes fail with actionable error; no corrupt partial JSON (atomic write via temp + rename).
- **Permission denied:** Path shown; offer copy path, skip file, or elevate (platform-appropriate).
- **Cancellation:** All long operations honor `CancellationToken`; UI returns to idle ≤250ms P99.

### 0.9 Global accessibility (QPR-G.003)

- WCAG 2.2 AA for all QuantumIDE-owned UI (parity dock, custom settings panels, chat augmentations).
- Full keyboard operability; visible focus rings; `prefers-reduced-motion` disables non-essential animations (QPR-11.2.x).
- Screen reader labels for streaming state, diff cards, agent steps, indexing progress.

### 0.10 Global security & privacy (QPR-G.004)

- Secrets never in semantic index, snapshots, collab payloads, or telemetry (redaction QPR-12.3.x).
- Dangerous terminal commands blocked by default policy (QPR-8.3.x).
- User consent before cross-machine sync of code or chat (QPR-9.2.x, QPR-5.1.x).

---

## 1. AI chat workflows

### QPR-1.1.001 — Continuous context injection (ranked, incremental)

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Current state** | PARTIAL |
| **Current defects** | Orchestrator exists (`quantumideChatContextOrchestrator.ts`) but: diagnostics capped (~20) arbitrarily; no debounced cursor sync mid-turn; manifest content often tool-only; monorepo package boundaries weak; no context inspector UI; rebuild SLA not proven on large repos. |
| **Expected behavior** | On every agent turn (and Edit mode send), system assembles ranked context within `quantumide.chat.tokenBudget`: active file, selection, visible tabs, live diagnostics (ranked by severity/proximity), git diff summary, branch, terminal tail + parsed errors, LSP symbol at cursor, dependency graph slice, file history, navigation history, indexed comments/diagnostics matches, project manifests (parsed). Updates incrementally on file/diagnostic/SCM events without user “reload context” unless forced. |
| **Failure behavior** | If section fails (e.g. LSP timeout), omit section and record in context health; never send empty agent turn without user-visible warning. |
| **Recovery** | `quantumide.chat.reloadContext` rebuilds; context health shows per-section status + last error + retry. |
| **UX polish** | Inspector panel lists sections with token estimates; stale sections show age; “out of date” badge if >30s on live sections. |
| **Architecture** | `IQuantumIDEChatContextOrchestrator` + pluggable section providers; ranker (`quantumideContextRanker.ts`); health (`quantumideContextHealthService.ts`). No blocking disk on UI thread. |
| **Scalability** | Enterprise profile streams sections; hard cap with LRU within budget. |
| **Consistency** | Same section set for Ask/Edit/Agent unless mode policy excludes (documented). |
| **Performance** | Inherits QPR-G.001 context rebuild budgets. |
| **Acceptance** | Introduce TS error in active file → next agent message includes error without `@`; inspector shows all attached sections; reload completes within budget on 500-file fixture. |

### QPR-1.1.002 — Context attachment chips (@-style)

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Current state** | MISSING (DELEGATED fragments only) |
| **Current defects** | No first-class chips in chat input for file/folder/symbol/selection; VS Code chat variables not fully surfaced for QuantumIDE product. |
| **Expected behavior** | Chat input shows removable chips: Active File, Selection, Folder(s), Symbol, Docs. Typing `@` opens fuzzy provider (paths, symbols, docs). Adding/removing chip updates next-message context deterministically. |
| **Failure behavior** | Missing file → chip red + tooltip “file deleted”; excluded from payload. |
| **Recovery** | User removes chip or picks replacement. |
| **UX polish** | Chip icons by type; keyboard Backspace removes last chip; drag reorder optional P2. |
| **Architecture** | Bridge to `ChatPromptCodec` / variable APIs; persist attachments per thread in thread store. |
| **Acceptance** | Type `@src/` → pick file → chip appears → send → inspector shows file content referenced. |

### QPR-1.1.003 — Navigation & file history in context

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Current state** | PARTIAL |
| **Current defects** | Full navigation-history provider incomplete; session file history cached but not Cursor-grade recency ranking. |
| **Expected behavior** | Last N navigation events (goto def, peek, tab switch) inform ranking; agent queries benefit from “recently viewed” weighting. |
| **Failure behavior** | History unavailable → section omitted. |
| **Recovery** | Cleared on workspace close; user can disable in settings. |
| **Acceptance** | Open file A, go to def in B, ask “what was I just looking at?” → context includes A and B with recency metadata. |

### QPR-1.1.004 — Encrypted cross-device chat sync

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Current state** | MISSING |
| **Current defects** | Threads in workspace `IStorageService` only; no E2E sync. |
| **Expected behavior** | Opt-in sync encrypts threads + attachments at rest and in transit; conflict resolution per-thread; device list in settings. |
| **Failure behavior** | Offline queue; sync paused banner. |
| **Recovery** | Force resync; export local copy. |
| **Security** | E2E keys in OS keychain; user passphrase optional. |
| **Acceptance** | Two machines same account → thread appears <60s when online; ciphertext not readable on server. |

### QPR-1.2.001 — Streaming response UX

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Current state** | PARTIAL |
| **Current defects** | Native streaming works; parity dock indicator only; no in-message tool step renderers; cancel not propagated to all sub-processes (tests/terminal). |
| **Expected behavior** | Assistant content streams token-wise with stable layout (no jitter >1 line); tool calls show inline cards (running → success/fail); thinking/reasoning blocks collapsible; stop button always visible during stream. |
| **Failure behavior** | Stream error → partial content preserved + retry. |
| **Recovery** | Cancel → `workbench.action.chat.cancel` + abort agent task (QPR-3.1.x) + kill tracked terminals. |
| **UX polish** | Shimmer only while bytes arriving; reduced motion → instant append chunks. |
| **Performance** | Cancel ≤100ms P95 (QPR-G.001). |
| **Acceptance** | Long response → Stop → generation halts ≤250ms; tool card shows “cancelled”. |

### QPR-1.2.002 — Interruptible tool & terminal execution

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Current state** | PARTIAL |
| **Current defects** | Chat cancel exists; shell tests may continue; host tool batch pause not wired (v3 §9.1). |
| **Expected behavior** | Cancel cascades: LLM stream, pending tool calls, integrated terminal child processes, test runners started by agent. |
| **Failure behavior** | If process cannot kill, show PID + “Force stop” with warning. |
| **Recovery** | User force stop; session marks step failed. |
| **Acceptance** | Agent runs `npm test` → Cancel → process tree terminated within 5s; chat step failed. |

### QPR-1.3.001 — Thread model & persistence

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Current state** | PARTIAL |
| **Current defects** | `quantumideChatThreadStoreService.ts` workspace-local; search/open/pin/branch in dock; no cloud; branching semantics may not match Cursor thread fork UX. |
| **Expected behavior** | Each thread: id, title, created/updated, pinned, model mode, attachments snapshot, linked checkpoint ids. Auto-save on message complete. Search by title/content. Branch creates new thread with parent pointer. |
| **Failure behavior** | Corrupt store entry → quarantine file + offer delete thread. |
| **Recovery** | Import/export threads JSON (encrypted optional). |
| **Architecture** | Storage abstraction: local + optional remote adapter. |
| **Acceptance** | Pin thread → reload window → still pinned; branch → two threads with lineage. |

### QPR-1.3.002 — Thread UI in chat panel (not dock-only)

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Current state** | PARTIAL (dock-heavy) |
| **Current defects** | Primary thread list in parity dock; chat panel native history may be incomplete. |
| **Expected behavior** | Chat sidebar shows thread list with search, new thread, pin, archive; keyboard navigable. |
| **Acceptance** | User never required to open parity dock to switch threads. |

### QPR-1.4.001 — Unified multi-file edit review pipeline

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Current state** | INCONSISTENT |
| **Current defects** | `propose_file_edit`, `quantumide_stage_chat_edits`, `ChatReviewPendingEdits`, multi-diff editor, inline diff — different entry points; no single chat-native card component. |
| **Expected behavior** | All edit proposals normalized to `IQuantumIDEEditProposal[]` with per-file hunks. Chat renders **Edit Review Card** per file: path, stats, preview, Accept / Reject / Open diff. **Apply All** / **Reject All** atomic. One undo group for applied batch. |
| **Failure behavior** | Apply conflict → card shows conflict hunks; disk unchanged for failed files. |
| **Recovery** | Reject all; restore checkpoint (QPR-5.2.x). |
| **UX polish** | Cards appear inline in thread order; progress on Apply All. |
| **Architecture** | `IQuantumIDEChatEditSessionService` owns state; diff review service renders; agent host approvals use same cards. |
| **Acceptance** | 3-file proposal → 3 cards → accept 2 → disk matches exactly; undo once reverts both. |

### QPR-1.4.002 — Apply code block from assistant message

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Current state** | PARTIAL |
| **Current defects** | `MenuId.ChatCodeBlock` “Apply to Active Editor” exists; not full hunk merge; notebook unsupported. |
| **Expected behavior** | Every fenced block in assistant messages shows Apply / Copy / Insert at cursor; Apply uses merge strategy UI if overlap; respects dirty buffer (save/discard prompt). |
| **Failure behavior** | Read-only editor → disabled Apply + explanation. |
| **Recovery** | User saves file → retry. |
| **Acceptance** | Select function → agent returns block → Apply → editor updates → undo restores. |

### QPR-1.4.003 — Chat-native merge conflict resolution

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Current state** | STUB/PARTIAL |
| **Current defects** | `quantumide_merge_conflict` tool; no inline conflict widget in chat. |
| **Expected behavior** | Conflicts show per-conflict Accept Current / Accept Incoming / Merge in chat card; links open merge editor. |
| **Acceptance** | Simulated conflict → resolved from chat without-only command palette. |

### QPR-1.5.001 — Chat modes (Ask, Edit, Agent, Refactor, Review, Terminal, Planning)

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Current state** | PARTIAL |
| **Current defects** | Modes registered on agent host; mode-specific UX (prompt addons, tool policies) uneven; Planning mode checklist UI weak. |
| **Expected behavior** | Mode switch changes: system instructions, tool allowlist, context sections, approval strictness, UI labels. Review mode attaches SCM summary. Terminal mode prioritizes terminal output context. Planning produces editable checklist before execution. |
| **Consistency** | Mode visible in input chrome; persisted per thread. |
| **Acceptance** | Switch Agent → Planning → user sees plan checklist before tools run. |

---

## 2. Inline AI editing & autocomplete

### QPR-2.1.001 — Ghost text / inline completion parity

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Current state** | DELEGATED + PARTIAL |
| **Current defects** | Relies on VS Code inline suggest; QuantumIDE model routing exists; no dedicated prefetch cache; latency not CI-gated. |
| **Expected behavior** | Inline completions respect `quantumide.ai.modelRouter.taskRoutes.inline`; ghost text obeys `quantumide.chat.inline.ghostText`; Tab accept, Esc dismiss documented; multi-cursor aware. |
| **Failure behavior** | Model timeout → no ghost; silent. |
| **Recovery** | Retry on next trigger. |
| **Performance** | ≤200ms P95 first suggestion (QPR-G.001). |
| **Architecture** | Prefetch cache layer for top-N completion contexts (P1). |
| **Acceptance** | Type in TS file → ghost appears <200ms P95 on warm path in CI fixture. |

### QPR-2.2.001 — Streaming inline edit preview

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Current state** | MISSING |
| **Current defects** | Inline diff post-hoc only; no stream-as-generate in editor. |
| **Expected behavior** | Cmd+K (or bound) inline bar → stream proposed text into ghost region → Tab accept full hunk, Esc reject. |
| **UX polish** | Inline bar anchored to selection; loading micro-state inside bar. |
| **Acceptance** | Inline prompt streams → Tab applies → undo reverts. |

### QPR-2.2.002 — Inline diff gutter & partial hunk accept

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Current state** | PARTIAL |
| **Current defects** | `IQuantumIDEInlineDiffService` + multi-diff; gutter hunk controls incomplete; partial accept in editor not uniform all languages. |
| **Expected behavior** | Added/changed lines show gutter actions Accept Hunk / Reject Hunk; side-by-side and unified commands; keyboard shortcuts documented. |
| **Acceptance** | Multi-hunk file → accept hunk 2 only → file matches expectation. |

### QPR-2.2.003 — Diagnostic-linked quick fixes

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Current state** | PARTIAL |
| **Current defects** | Lightbulb actions (Explain, Fix, …) exist; not full marker-code → fix → apply loop. |
| **Expected behavior** | Error squiggle → lightbulb → AI fix proposal → preview → apply without opening chat panel. |
| **Acceptance** | TS unused var → quick fix → applied. |

### QPR-2.2.004 — Inline edit commands catalog

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Current state** | PARTIAL |
| **Expected behavior** | explain, optimize, rewrite, refactor, tests, docs, convert syntax, migrate framework — each with consistent UX per QPR-2.2.001–003. |
| **Consistency** | Same keybinding scheme; settings per command enable. |

---

## 3. Agent workflows

### QPR-3.1.001 — Multi-step task orchestration (workbench)

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Current state** | DONE (workbench scope) |
| **Current defects** | Host tool-loop step gate still open (v3 §9.2); background runner without chat missing; cross-session resume UI minimal. |
| **Expected behavior** | Tasks: plan steps, running/paused/completed/failed/cancelled; checkpoint before each step; rollback to step snapshot; pause/resume/abort commands; dock + tool `quantumide_agent_task`; chat bridge for turns. |
| **Failure behavior** | Snapshot fail → step runs without checkpoint but warns. |
| **Recovery** | Rollback step; abort rejects pending edits. |
| **Acceptance** | Documented in traceability §3.1; extend with QPR-3.1.002–004. |

### QPR-3.1.002 — Agent host step gate & batch pause

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Current state** | MISSING |
| **Current defects** | Workbench orchestrator cannot pause between host tool batches; RPC not extended. |
| **Expected behavior** | Host honors `pauseBeforeNextTool`; workbench Pause sends signal; UI shows “paused before tool X”; Resume continues; Step executes exactly one tool then pauses. |
| **Architecture** | Extend agent host `ActionType` / session handler; workbench `IQuantumIDEAgentHostBridge`. |
| **Acceptance** | Agent about to run terminal → Pause → no terminal starts until Resume. |

### QPR-3.1.003 — Background agent runner (decoupled from chat stream)

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Current state** | MISSING |
| **Expected behavior** | Long tasks run in background session; status in status bar + agent dock; notifications on complete/fail; cancellable. |
| **Failure behavior** | Window close → task persists or prompts. |
| **Recovery** | Resume task from timeline. |
| **Acceptance** | Start “refactor tests” → close chat panel → task continues → notification on done. |

### QPR-3.1.004 — Execution graph UI in chat

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Current state** | PARTIAL |
| **Current defects** | `.quantumide/execution-graph.json` + tool updates; no checklist UI in chat thread. |
| **Expected behavior** | Planning mode renders live checklist: Planning → Retrieval → Modify → Verify → Review with icons; failed node shows error + retry. |
| **Acceptance** | Agent task updates graph → user sees checklist without opening JSON. |

### QPR-3.1.005 — Iterate-until-complete enforcement

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Current state** | PARTIAL |
| **Current defects** | Setting `quantumide.agent.iterateUntilComplete` exists; enforcement prompt-only in some paths. |
| **Expected behavior** | When enabled, after apply agent must run verify (lint/test/compile per policy) before declaring done; max continuations surfaced in UI. |
| **Acceptance** | Failing test → auto continuation → pass or explicit max reached message. |

### QPR-3.2.001 — Workspace LSP rename (atomic preview)

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Current state** | PARTIAL |
| **Current defects** | `preferLspRename` guidance; client rename tool; preview not unified with chat cards; regex rename_symbol still fallback. |
| **Expected behavior** | Workspace-wide rename via LSP; multi-file preview in unified review; Apply commits atomically; undo once. |
| **Failure behavior** | LSP unavailable → offer text rename with explicit warning. |
| **Acceptance** | Rename symbol across 10 files → preview all → apply → undo restores. |

### QPR-3.2.002 — LSP extract method / move module / migrate

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Current state** | STUB (host regex tools) |
| **Current defects** | Host tools `extract_method`, `move_module`, etc. not true LSP refactors. |
| **Expected behavior** | Invoke language server refactor providers; preview; validate diagnostics post-apply; `quantumide.agent.refactorAutoVerify` runs check. |
| **Acceptance** | Extract method in TS → LSP preview → apply → compiles. |

### QPR-3.2.003 — Refactor workflow dock → chat integration

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Current state** | PARTIAL |
| **Current defects** | `quantumideRefactorWorkflowService.ts` + dock section only. |
| **Expected behavior** | Refactor catalog runnable from chat; history visible in thread. |

---

## 4. Context management & codebase indexing

### QPR-4.1.001 — Background indexer worker

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Current state** | PARTIAL |
| **Current defects** | Indexing on extension host / main thread paths; UI can stall on large repos; 500/50k caps. |
| **Expected behavior** | Dedicated worker (or child process) owns scan + parse + embed; UI receives progress events only. |
| **UX polish** | Status bar: “Indexing 42% (12k/30k files)”; click opens detail drawer. |
| **Failure behavior** | Worker crash → auto-restart with backoff; resume from checkpoint. |
| **Acceptance** | 30k files → UI responsive; search returns partial results during index. |

### QPR-4.1.002 — Tree-sitter in index pipeline

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Current state** | BROKEN/PARTIAL |
| **Current defects** | Adapter exists; AST index uses regex fallback after import cycle fix. |
| **Expected behavior** | Tree-sitter WASM parses supported languages; symbols/imports from AST; injection breaks cycles via interface. |
| **Acceptance** | TS file index lists accurate function boundaries vs regex. |

### QPR-4.1.003 — Incremental per-file index update

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Current state** | PARTIAL |
| **Current defects** | Dirty buffer re-index in background indexer; not all paths include unsaved buffers. |
| **Expected behavior** | On save **and** debounced unsaved change → update semantic, vector, symbol, AST shards for that file only; ≤2s P95. |
| **Acceptance** | Edit unsaved → search finds new symbol within 2s. |

### QPR-4.1.004 — Vector persistence on every reindex path

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Current state** | PARTIAL |
| **Current defects** | incremental / lancedb / json modes; Lance workbench path incomplete; reindex may skip vectors. |
| **Expected behavior** | Every full reindex and incremental file update persists vectors per `quantumide.indexing.vectorStore`; no silent fallback without user-visible setting note. |
| **Acceptance** | Reindex → vector count matches chunk count in inspect UI. |

### QPR-4.1.005 — Scale profiles & millions-LOC proof

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Current state** | PARTIAL |
| **Expected behavior** | Enterprise profile tested on 1M+ LOC fixture; memory bounds documented; exclude rules honored (.gitignore + custom). |
| **Acceptance** | CI perf job indexes 10k-file fixture within time budget; search usable at 50% complete. |

### QPR-4.2.001 — Unified semantic + symbol search UI

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Current state** | MISSING (tools only) |
| **Expected behavior** | Chat/sidebar search box: hybrid semantic + symbol + path; results with signature preview; click → peek editor at definition. |
| **Performance** | P95 ≤300ms (QPR-G.001). |
| **Acceptance** | Query “auth middleware” → top 5 with signatures → click opens definition. |

### QPR-4.2.002 — Reference / implementation navigation from results

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Current state** | PARTIAL (host tools) |
| **Expected behavior** | Each result actions: Go to Def, Find References, Peek Impl. |
| **Acceptance** | From chat result → references listed → navigate. |

### QPR-4.2.003 — Comments & diagnostics indices freshness

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Current state** | PARTIAL |
| **Current defects** | Indices exist; marker change incremental sync incomplete. |
| **Expected behavior** | On `onMarkerChanged` debounced rebuild of diagnostics index; comments index updated on file change. |
| **Acceptance** | New error → appears in `search_workspace_diagnostics` without manual reindex. |

---

## 5. Workspace memory, state, persistence

### QPR-5.1.001 — Session state capture & restore

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Current state** | PARTIAL |
| **Current defects** | `quantumideWorkspaceStateService.ts` saves layout, tabs, cursors, dirty, chat session, pending edits, tree expand; transactional merge with VS Code restore incomplete. |
| **Expected behavior** | Auto-save every 2.5s debounced + on shutdown; atomic JSON under `.quantumide/workspace-state/`; restore on startup before editor flash; conflict with core workspace state resolved deterministically (QuantumIDE wins for listed keys). |
| **Failure behavior** | Corrupt JSON → fallback previous history entry (20 kept). |
| **Recovery** | Command restore session by timestamp. |
| **Acceptance** | Reload window → tabs/cursor/chat session restored. |

### QPR-5.1.002 — Encrypted cloud workspace state (opt-in)

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Current state** | MISSING |
| **Expected behavior** | Same as QPR-1.1.004 for workspace state blob. |

### QPR-5.2.001 — Workspace snapshots & checkpoints

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Current state** | PARTIAL |
| **Current defects** | Snapshot service + timeline dock; no full side-by-side viewer in timeline; deduplication missing. |
| **Expected behavior** | Named snapshots; pre-restore auto-backup; list/delete/diff/restore; agent step checkpoints reference snapshot ids. |
| **Failure behavior** | Restore fail → keep current state; show error. |
| **Recovery** | Restore previous auto-backup. |
| **Acceptance** | Create snapshot → modify files → restore → content exact. |

### QPR-5.2.002 — Timeline side-by-side diff viewer

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Current state** | MISSING |
| **Current defects** | Structured diff in dock text only. |
| **Expected behavior** | Selecting timeline entry opens embedded or editor side-by-side diff with syntax highlight; per-file navigate. |
| **Acceptance** | Snapshot with 5 files → user reviews each diff in viewer. |

### QPR-5.2.003 — Snapshot storage deduplication

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Current state** | MISSING |
| **Expected behavior** | Content-addressed chunks for unchanged files; snapshot metadata only delta. |

---

## 6. Editor responsiveness & UX

### QPR-6.1.001 — QuantumIDE overlay performance budget

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Current state** | DELEGATED |
| **Expected behavior** | Inline diff, ghost text, parity widgets must not degrade Monaco input latency beyond QPR-G.001. |
| **Verification** | Profiler CI on typing with active inline diff. |

### QPR-6.2.001 — WCAG 2.2 AA audit (QuantumIDE UI)

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Current state** | MISSING |
| **Expected behavior** | axe-core CI on parity dock, settings panels, chat augmentations; zero critical violations. |

### QPR-6.2.002 — Reduced motion & high contrast

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Current state** | MISSING |
| **Expected behavior** | `prefers-reduced-motion` disables timeline/panel animations; high contrast tokens for parity UI. |

### QPR-6.2.003 — Keyboard navigation parity dock

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Current state** | PARTIAL |
| **Current defects** | Virtual tree has keyboard; full dock section tabs not audited. |
| **Expected behavior** | Arrow keys navigate tree; Enter activates; shortcuts documented. |

---

## 7. File tree, tabs, window management

### QPR-7.1.001 — Parity virtual file tree (complete)

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Current state** | PARTIAL |
| **Current defects** | `quantumideParityVirtualTree.ts` in dock; core Explorer not upgraded. |
| **Expected behavior** | Virtual scroll 40+ rows; multi-select; keyboard nav; DnD move; filter; error banner; loading skeleton (real load, not fake). |
| **Failure behavior** | Move fail → revert UI selection; toast with path error. |
| **Acceptance** | DnD file → moves on disk; search finds nested path. |

### QPR-7.1.002 — Core workbench Explorer parity

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Current state** | DELEGATED |
| **Expected behavior** | Same DnD/move/rename semantics as parity tree OR documented single-tree strategy. |

### QPR-7.1.003 — File tree a11y audit

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Current state** | MISSING |
| **Expected behavior** | aria-tree roles; screen reader announces expand/collapse and selection count. |

### QPR-7.2.001 — Tab groups persistence (augment core)

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Current state** | DELEGATED |
| **Expected behavior** | QuantumIDE workspace state includes editor group layout beyond core if Cursor parity requires. |

---

## 8. Panel, command palette, terminal

### QPR-8.1.001 — Parity dock as actionable hub (not empty chrome)

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Current state** | PARTIAL |
| **Current defects** | Many sections; some still agent-centric; empty states improved but not all Cursor-grade. |
| **Expected behavior** | No workspace → only Get started; workspace → sections visible by **actionability** (spec in chat-platform.md); empty sections hidden; real loading tied to services. |
| **Consistency** | Same data in dock and chat cards where duplicated. |

### QPR-8.2.001 — Agent command policy & audit

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Current state** | PARTIAL |
| **Current defects** | `quantumide_execute_workbench_command` broad; audit service exists; denylist incomplete. |
| **Expected behavior** | Default deny dangerous commands; workspace allowlist; `list_matching_commands(query)` tool; session audit log in UI. |
| **Acceptance** | `rm -rf /` blocked; `npm test` logged. |

### QPR-8.3.001 — Structured terminal blocks in chat

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Current state** | MISSING |
| **Current defects** | Terminal output in context text; no embedded blocks. |
| **Expected behavior** | Each agent command renders block: command line, cwd, env badge, streaming output, exit code; stderr red; Copy / Rerun / Cancel. |
| **Failure behavior** | Timeout → partial output + kill. |
| **Recovery** | Rerun with approval. |
| **Acceptance** | Failed test command shows exit code 1 styled red under message. |

### QPR-8.3.002 — Terminal sandbox & approval memory

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Current state** | PARTIAL |
| **Current defects** | `quantumideTerminalSandbox.ts` blocks dangerous; no “always allow” memory; no OS sandbox. |
| **Expected behavior** | Per-workspace allowlist; “Always allow npm test” persistence; optional OS sandbox mode (container/seatbelt) documented per platform. |
| **Acceptance** | User always-allows → second run no prompt. |

### QPR-8.3.003 — Run code block from chat (▶)

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Current state** | MISSING |
| **Current defects** | `IQuantumIDELivePreviewService` tool-only. |
| **Expected behavior** | Fenced blocks show Run; language-aware runner; output under block within 10s; Cancel stops process. |
| **Acceptance** | Click Run on Python block → output appears; Cancel works. |

---

## 9. Extension, plugin, sync

### QPR-9.1.001 — Plugin registry & consent

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Current state** | PARTIAL |
| **Current defects** | `registerQuantumIDEPlugin`; settings partial; no per-session tool toggles in chat. |
| **Expected behavior** | Settings lists plugins; enable/disable; per-tool consent; versioned manifest schema; dynamic reload on extension change. |
| **Acceptance** | Disable plugin → tool absent next turn. |

### QPR-9.1.002 — MCP server management UI

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Current state** | PARTIAL |
| **Current defects** | `.quantumide/mcp-tools.json` manifest; no full settings UI. |
| **Expected behavior** | Settings → MCP: add server, auth, tool enablement per server, connection status. |
| **Acceptance** | Connect MCP → tools appear → disable one tool → host skips it. |

### QPR-9.2.001 — Collaboration product honesty OR full transport

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Current state** | STUB (marketed as collab) |
| **Current defects** | AES-GCM `.quantumide/collab/` + BroadcastChannel; no CRDT; no remote relay; not cross-machine without shared folder. |
| **Expected behavior (Option A)** | WebSocket/WebRTC relay; live chat sync <2s; presence; shared cursor; conflict resolution for edits; invite links; auth. |
| **Expected behavior (Option B)** | Rebrand to “Session export”; hide Start/Join unless experimental flag; no “real-time” copy. |
| **Acceptance** | Option A: two browsers different machines see messages <2s. Option B: UI matches capability. |

### QPR-9.2.002 — Encrypted collab payload integrity

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Current state** | PARTIAL |
| **Expected behavior** | AES-GCM with rotated keys; tamper detection; queue ordering; offline replay on reconnect. |
| **Acceptance** | Tampered file rejected; offline edits sync on online. |

### QPR-9.2.003 — CRDT or OT for shared edits (if Option A)

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Current state** | MISSING |
| **Expected behavior** | Concurrent edit same file merges or surfaces conflict UI; not last-write-wins silent. |

---

## 10. Recovery, error handling, reliability

### QPR-10.1.001 — Central error boundary

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Current state** | PARTIAL |
| **Current defects** | `quantumideErrorRecoveryService.ts` + context health; not all subsystems wrapped. |
| **Expected behavior** | Uncaught subsystem errors → report id, user toast, recoverable actions; no white screen. |
| **Recovery** | Retry, reload window, open logs. |
| **Acceptance** | Forced indexer throw → chat still sendable with warning. |

### QPR-10.1.002 — Error recovery actions in UI

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Current state** | PARTIAL |
| **Expected behavior** | Notifications use `Action` for retry commands; agent step fail offers rollback (wired for agent tasks). |
| **Consistency** | Same pattern for index, context, collab, snapshot failures. |

### QPR-10.2.001 — Offline mode behavior

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Current state** | DELEGATED (Electron) |
| **Expected behavior** | QuantumIDE features degrade: no model calls (clear banner), local index/search works, queued sync when online. |
| **Acceptance** | Airplane mode → offline banner; local search works. |

### QPR-10.2.002 — Reconnect merge UI (sync)

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Current state** | MISSING |
| **Expected behavior** | On reconnect after offline collab/sync, show merge summary before applying remote. |

### QPR-10.2.003 — Version history integration

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Current state** | DELEGATED |
| **Expected behavior** | Timeline links to VS Code local history where applicable; QuantumIDE snapshots for agent checkpoints. |

---

## 11. UI/UX, animation, visual polish

### QPR-11.1.001 — Design token package

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Current state** | MISSING |
| **Current defects** | Ad hoc `chatViewPane.css`; no shared tokens. |
| **Expected behavior** | `@quantumide/design-tokens` (spacing, type, color, elevation) consumed by dock, chat cards, settings; dark/light/high contrast. |
| **Consistency** | No hardcoded hex in feature CSS except tokens file. |

### QPR-11.1.002 — Visual hierarchy & density

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Current state** | PARTIAL |
| **Expected behavior** | Section headers, primary/secondary actions, muted meta text consistent across dock sections (`quantumideChatParityUi.ts` patterns enforced). |

### QPR-11.2.001 — Animation system rules

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Current state** | PARTIAL |
| **Current defects** | Timeline animation only; no global reduced-motion. |
| **Expected behavior** | 200–300ms ease transitions; streaming pulse; panel expand/collapse; 60fps no layout thrash; GPU-friendly transforms only. |
| **Acceptance** | Performance test: dock expand 60fps on mid-tier hardware. |

### QPR-11.2.002 — Loading states (real only)

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Current state** | PARTIAL |
| **Expected behavior** | Skeleton/spinner only when `isLoading` true on service; never infinite fake loaders. |
| **Acceptance** | Disconnect network during index → loader ends with error state. |

### QPR-11.3.001 — Notifications & toasts

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Current state** | DELEGATED + PARTIAL |
| **Expected behavior** | QuantumIDE operations use `INotificationService` with actions; no duplicate toast storms; progress notifications for long index. |

### QPR-11.3.002 — Trust & reliability UX

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Current state** | PARTIAL |
| **Expected behavior** | Destructive actions confirm; show model name, token usage estimate optional; “what will run” summary before agent batch terminal. |

---

## 12. Performance, telemetry, security, deployment

### QPR-12.1.001 — Performance marks & user-visible report

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Current state** | PARTIAL |
| **Expected behavior** | Command opens performance report; marks for ChatStartup, ContextBuild, retrieval, inline; auto-sample when empty. |

### QPR-12.1.002 — CI performance gate

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Current state** | MISSING |
| **Expected behavior** | PR job on 10k-file fixture; fails if budgets exceeded by >20%. |
| **Acceptance** | Intentional regression fails CI. |

### QPR-12.2.001 — Opt-in QuantumIDE telemetry pipeline

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Current state** | PARTIAL (VS Code telemetry + command audit) |
| **Expected behavior** | Settings opt-in; events: feature success/fail, latency histograms, no code content; local export. |

### QPR-12.2.002 — DevTools & observability

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Current state** | PARTIAL |
| **Expected behavior** | Agent activity channel; command audit viewer; index health dashboard. |

### QPR-12.3.001 — Secret redaction

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Current state** | PARTIAL |
| **Expected behavior** | `.env`, keys in terminal, API keys in logs redacted; never indexed. |
| **Acceptance** | Test: `.env` not in semantic search; terminal key pattern redacted in activity log. |

### QPR-12.3.002 — Enterprise policy enforcement tests

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Current state** | PARTIAL |
| **Expected behavior** | `policies.json` enforced in CI scenarios; audit export. |

### QPR-12.4.001 — Production deployment readiness

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Current state** | PARTIAL |
| **Expected behavior** | Signed builds; auto-update channel; crash reporting opt-in; feature flags; migration scripts for `.quantumide/` schema versions. |
| **Acceptance** | Upgrade from N-1 release preserves workspace state and indices. |

### QPR-12.4.002 — Cross-platform consistency

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Current state** | PARTIAL |
| **Expected behavior** | macOS, Windows, Linux feature parity for QuantumIDE-owned UI; sandbox rules per OS documented. |
| **Acceptance** | CI runs critical E2E on three OS runners. |

---

## 13. Settings architecture (PRD §3)

### QPR-13.001 — Settings search & keyboard nav

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Current state** | PARTIAL |
| **Current defects** | 14 categories + live preview; search highlight incomplete. |
| **Expected behavior** | Search highlights matches; Enter navigates; focus trap; sync model picker with active chat session. |
| **Acceptance** | Search “vector” finds indexing vector store. |

### QPR-13.002 — Settings category completeness

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Current state** | PARTIAL |
| **Expected behavior** | All categories per ChatPanel §3.2: General, AI Models, Chat, Agent, Editor, Terminal, Indexing, Privacy, Appearance, Keybindings, Accounts, Extensions, Experimental — each with inline help links. |

### QPR-13.003 — Agent behavior settings enforcement

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Current state** | PARTIAL |
| **Expected behavior** | maxEditScope, retryOnError, dangerousCommandBlock, autoApplyThreshold, iterateUntilComplete — host and workbench read same values; UI shows effective policy. |

---

## 14. Onboarding & guidance

### QPR-14.001 — Multi-step product tour

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Current state** | PARTIAL |
| **Current defects** | `IQuantumIDEOnboardingService`; contextual tips; no full tour. |
| **Expected behavior** | First launch: 3+ step tour (chat, @, agent, diff review); skippable; never repeats; stored completion flag. |
| **Acceptance** | Fresh profile sees tour once. |

### QPR-14.002 — Empty states & first-use tooltips

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Current state** | PARTIAL |
| **Expected behavior** | Chat empty state with primary actions; first inline diff shows Esc/Tab tooltip once. |

---

## 15. Keyboard shortcuts (PRD §3.6)

### QPR-15.001 — QuantumIDE keybinding export/import

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Current state** | PARTIAL |
| **Expected behavior** | JSON import/export; workspace overrides; conflict detection UI. |
| **Acceptance** | Import bindings → conflicts listed → resolve. |

---

## 16. Intelligent caching & concurrency

### QPR-16.001 — Context & index cache coherency

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Current state** | PARTIAL |
| **Expected behavior** | File change invalidates: semantic shard, vector chunk, AST entry, context section cache; no stale reads >2s after save. |
| **Concurrency** | Single-writer per file id; readers snapshot version. |

### QPR-16.002 — Chat edit session isolation

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Current state** | PARTIAL |
| **Expected behavior** | Concurrent threads do not share pending edit maps; apply locks per workspace root. |

---

## 17. Background task orchestration (beyond agent)

### QPR-17.001 — Indexing as background task

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Inherits** | QPR-4.1.001 |

### QPR-17.002 — Snapshot/gc background jobs

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Current state** | MISSING |
| **Expected behavior** | Scheduled dedup GC; retention policy in settings. |

---

## 18. Rendering & perceived performance

### QPR-18.001 — Virtualized lists everywhere

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Current state** | PARTIAL |
| **Expected behavior** | Thread list, search results, file tree, test results >100 rows use virtualization. |

### QPR-18.002 — Perceived performance (skeleton → content)

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Expected behavior** | <100ms skeleton display on slow ops; crossfade to content; no layout shift > stable CLS budget. |

---

## 19. State transition reference (agent task)

| From | Event | To | User-visible |
|------|-------|-----|--------------|
| idle | beginTask | planning/running | Step list appears |
| running | pause | paused | Pause badge |
| paused | resume | running | Resume spinner on current step |
| running | complete all steps | completed | Success summary |
| running | failStep | failed | Error + rollback action |
| * | abort | cancelled | Reject pending edits |
| running | rollbackToStep | running/paused | Files restored from snapshot |

---

## 20. Implementation phase order (binding)

| Phase | Requirements | Theme |
|-------|----------------|-------|
| 1 | QPR-4.1.001–005, QPR-9.2.001, QPR-11.2.002 | Index scale + collab honesty + real loaders |
| 2 | QPR-1.4.001–003, QPR-3.2.001, QPR-1.4.002, QPR-2.2.001–002 | Unified diff + LSP rename + editor apply |
| 3 | QPR-4.2.001–003, QPR-7.1.001, QPR-1.1.002 | Search UI + navigation + @ chips |
| 4 | QPR-8.3.001–003, QPR-3.1.004–005, QPR-1.2.002 | Terminal blocks + agent verify UI |
| 5 | QPR-1.1.001–003, QPR-1.2.001, QPR-8.1.001 | Context inspector + streaming cards |
| 6 | QPR-9.1.001–002, QPR-8.2.001, QPR-3.1.002 | Plugins, MCP, command policy, step gate |
| 7 | QPR-14.001, QPR-12.1.002, QPR-13.001, QPR-11.1.001 | Onboarding, perf CI, settings, tokens |

---

## 21. Verification matrix (definition of Done)

| Requirement area | Automated | Manual |
|------------------|-----------|--------|
| QPR-1.4 unified diff | Integration + Playwright | 3-file accept/reject mix |
| QPR-4.1 indexing | Perf job 10k fixture | Search while indexing |
| QPR-3.1 agent step gate | Integration host mock | Pause before terminal |
| QPR-8.3 terminal blocks | Integration | npm test output styling |
| QPR-1.1 context | Unit ranker + agent test | TS error auto-included |
| QPR-9.2 collab | E2E or hidden UI | Two clients <2s OR experimental off |
| QPR-12.3 secrets | Unit redaction | `.env` not indexed |
| QPR-6.2 a11y | axe CI | Keyboard dock navigation |

---

## 22. Document maintenance

1. Closing a requirement: set **Done** in [quantumide-production-requirements-traceability.md](./quantumide-production-requirements-traceability.md) with file paths and date.  
2. Add implementation pointers to [quantumide-chat-platform.md](./quantumide-chat-platform.md).  
3. **Won’t fix** requires product sign-off and UI must not imply capability.  
4. New gaps discovered → add new `QPR-x.x.xxx` row here before coding.

---

## 23. Appendix — Current implementation inventory (partial, not Done)

| Component | Path | Spec status |
|-----------|------|-------------|
| Context orchestrator | `quantumideChatContextOrchestrator.ts` | QPR-1.1.001 PARTIAL |
| Context health | `quantumideContextHealthService.ts` | QPR-1.1.001 PARTIAL |
| Thread store | `quantumideChatThreadStoreService.ts` | QPR-1.3.001 PARTIAL |
| Chat edit session | `quantumideChatEditSessionService.ts` | QPR-1.4.001 PARTIAL |
| Agent task orchestrator | `quantumideAgentTaskOrchestratorService.ts` | QPR-3.1.001 DONE (workbench) |
| Workspace state | `quantumideWorkspaceStateService.ts` | QPR-5.1.001 PARTIAL |
| Snapshots | `quantumideWorkspaceSnapshotService.ts` | QPR-5.2.001 PARTIAL |
| Collaboration | `quantumideCollaborationService.ts` | QPR-9.2.001 STUB/P0 |
| Semantic index | `quantumideSemanticIndexService.ts` | QPR-4.1.x PARTIAL |
| Parity dock | `quantumideChatParityDock.ts` | QPR-8.1.001 PARTIAL |
| Production commands | `quantumideProduction.contribution.ts` | Various |
| Performance | `quantumidePerformance.contribution.ts` | QPR-12.1.001 PARTIAL |

---

*End of specification. Implement every QPR-* requirement until acceptance criteria pass. No shortcuts.*
