# QuantumIDE → Cursor-Level Gap Requirements

**Version:** 1.0  
**Status:** Normative for implementation  
**References:** `ChatPanelRe-engineering.md` v2.0, `quantumide-chat-platform.md`  
**Audience:** Engineers implementing chat, agent, indexing, editor, and platform subsystems  

---

## Developer mandate (read first)

You **must not** treat any item below as “done” because a similarly named tool, service, or setting exists. Parity means **Cursor-comparable user-visible behavior**, reliability at scale, and integrated UI—not agent-callable stubs, JSON files, or notification-only flows.

**Forbidden shortcuts (non-exhaustive):**

- Shipping host/client tools without **in-chat UI** where Cursor shows UI (diff cards, apply/reject, file chips, test result blocks).
- Replacing real-time features with **manual refresh**, **polling-only**, or **workspace-file handoff** (e.g. collaboration via `.json` without live sync).
- Claiming “LSP refactor” when only **regex/text** renames run (`rename_symbol` without workspace `vscode_renameSymbol`).
- Indexing caps (500 files standard) without a **true background indexer** and **incremental vector persistence on every reindex path**.
- “Test discovery” that lists paths but does not **run tests in structured UI** with pass/fail parsing and re-run from chat.
- Search that returns **paths only** without **clickable previews**, peek editor, or navigation from chat.
- Onboarding as a **one-shot notification** instead of guided, dismissible, in-product flows tied to features.
- Skipping **E2E / integration tests** called out in acceptance criteria.

Implement each requirement **exactly**. If a requirement is ambiguous, match **Cursor desktop chat + Agent** behavior (2024–2026) and document any intentional divergence in this file before coding.

---

## Severity legend

| Label | Meaning |
|-------|---------|
| **P0** | Blocks Cursor-level parity; user-visible broken or misleading |
| **P1** | Core workflow incomplete; power users will notice immediately |
| **P2** | Quality, scale, or polish required for “same quality level as Cursor” |

---

## A. Cursor parity (10 items) — detailed gaps

### A1. Direct editor manipulation — **P1**

| | |
|---|---|
| **Current** | `IQuantumIDEActiveEditorService`; client tool `quantumide_edit_active_editor` (insert/replace/append). |
| **Cursor-level** | Agent edits apply in-editor with undo stack integration; user sees change immediately; multi-cursor and selection-aware edits; chat can reference “current selection” without a tool call. |
| **Missing** | (1) **Undo/redo grouping** for agent edits (`editor.changeDecorations` / single undo transaction per agent turn). (2) **Chat-thread “Apply to editor”** buttons on code blocks in assistant messages (not only tools). (3) **Conflict handling** when buffer dirty or read-only. (4) **Notebook/cell** editors, not just text models. (5) E2E: select code → agent edit → undo restores exactly. |
| **Acceptance** | From chat, user can apply a proposed hunk to active editor in ≤2 clicks; undo once reverts entire agent edit batch; works with unsaved buffer (prompt to save or apply on disk). |

### A2. Inline suggestions & code actions — **P1**

| | |
|---|---|
| **Current** | Inline diff service, ghost text setting, lightbulb code actions (Explain, Fix, Optimize, Tests), `quantumide_show_inline_suggestion`. |
| **Cursor-level** | Ghost text / inline diff inline with streaming; Tab to accept; Esc to reject; quick fixes tied to diagnostics; Cmd+K style inline edit bar. |
| **Missing** | (1) **Streaming inline preview** while model generates (not only post-hoc diff). (2) **Keyboard-first accept/reject** bound and documented (parity with `quantumide.ai.inline.*` commands). (3) **Diagnostic-linked quick fixes** (marker code → suggested fix → apply). (4) **Inline edit input UI** in editor (not command-palette-only). (5) Partial hunk UI in **editor gutter**, not only multi-diff editor. |
| **Acceptance** | User selects code → inline prompt → sees streaming suggestion → Tab accepts, Esc rejects; at least one diagnostic quick-fix path from lightbulb to applied patch without opening chat. |

### A3. Real-time collaboration — **P0** (feature mislabeled today)

| | |
|---|---|
| **Current** | `IQuantumIDECollaborationService` writes `.quantumide/collab/{sessionId}.json`; poll via `quantumide_collab_sync`; Start/Join commands. |
| **Cursor-level** | Live shared sessions (or explicit “not in scope” product decision). If in scope: concurrent presence, shared chat context, optional shared edits with OT/CRDT or operational transform on session state. |
| **Missing** | Entire **transport layer** (WebSocket/WebRTC or Cursor-equivalent), **presence**, **live chat sync**, **conflict resolution**, **auth/session invites**. File JSON is a stub, not collaboration. |
| **Acceptance** | **Option A (implement):** Two clients see each other’s chat messages within 2s without git commit. **Option B (honest product):** Remove/mark experimental; doc states “file-based session export only” and hide Start/Join from default UI until transport exists. **Do not** ship Option B while marketing “real-time collaboration.” |

### A4. Context awareness of editor state — **P1**

| | |
|---|---|
| **Current** | `IQuantumIDEEditorStateService`; orchestrator sections (editor-state, selection, tabs); tool `quantumide_get_editor_state`. |
| **Cursor-level** | Automatic `@`-style attachments (file, folder, symbol, docs); context updates on cursor move without re-send; visible “context pills” in chat input. |
| **Missing** | (1) **Chat input attachment chips** for active file/selection (use VS Code chat variable APIs consistently). (2) **Debounced cursor sync** into agent context mid-turn where supported. (3) **Visible context inspector** (“what the agent sees”) in chat UI. (4) **Multi-root** folder context per attachment. |
| **Acceptance** | User sees active file + selection as attachable context in chat input; toggling attachment changes next message context; inspector shows ≥editor state + diagnostics summary. |

### A5. Rich UI interactions — **P1**

| | |
|---|---|
| **Current** | Code actions, inline diff decorations, merge commands via tools. |
| **Cursor-level** | Modals for destructive actions; tool confirmation cards; hover docs; clickable references; progress steps in chat. |
| **Missing** | (1) **In-chat tool renderers** for QuantumIDE tools (not plain markdown). (2) **Confirmation cards** for terminal/delete edits (wire agent host approval UX consistently). (3) **Clickable file/line references** in assistant text → `quantumide_go_to_line`. (4) **Hunk comment UI** wired to chat (not only command). |
| **Acceptance** | Terminal proposal shows approve/deny card; file paths in chat are links; tool steps show icon + status in activity stream. |

### A6. Command palette integration — **P2**

| | |
|---|---|
| **Current** | `quantumide_execute_workbench_command` runs any command by id. |
| **Cursor-level** | Agent uses curated, safe commands; fuzzy command discovery; user-visible command name in chat. |
| **Missing** | (1) **Allowlist/denylist** policy (enterprise + default deny dangerous ids). (2) **Command search tool** (`list_matching_commands(query)`). (3) **Audit log** of executed commands in session. |
| **Acceptance** | Dangerous commands blocked by policy; agent can discover `Format Document` by intent string; session log lists command ids run. |

### A7. Live preview / execution — **P1**

| | |
|---|---|
| **Current** | `IQuantumIDELivePreviewService` runs snippet in terminal; captures tail output. |
| **Cursor-level** | Run buttons on fenced blocks; REPL/notebook cell run; preview web for HTML; structured output (stderr vs stdout). |
| **Missing** | (1) **Run ▶ on code blocks** in chat UI. (2) **Language-aware runners** (not only node/python/shell heuristic). (3) **Long-running process** cancel; **cwd** selector. (4) **Notebook execution** path. (5) **Output panel** embedded under message. |
| **Acceptance** | Click Run on TS/Python block → output appears under message within 10s; Cancel stops process; errors styled separately from stdout. |

### A8. Drag-and-drop & file uploads — **P1**

| | |
|---|---|
| **Current** | VS Code `ChatDragAndDrop`; `quantumide.chat.attachFiles` shows hint notification only. |
| **Cursor-level** | Drop images/files into chat; paste screenshots; @-mention files; image understanding in agent context. |
| **Missing** | (1) **QuantumIDE-branded drop overlay** when chat focused (optional but parity polish). (2) **Image pipeline** to model (vision route) when configured. (3) **Folder drop** → indexed attachment with clear scope. (4) **Docs** in UI, not command-only. |
| **Acceptance** | Drop PNG + TS file into chat → both appear as attachments; agent receives image bytes or explicit “image attached” per model capability. |

### A9. Visual diff & merge in chat — **P1**

| | |
|---|---|
| **Current** | Multi-diff via `_workbench.openMultiDiffEditor`; tools `quantumide_open_visual_diff`, `quantumide_merge_conflict`; inline hunk decorations. |
| **Cursor-level** | Diff **embedded in chat thread**; per-file accept/reject; apply all; review mode drives SCM-style walkthrough. |
| **Missing** | (1) **Chat-native diff cards** (like Copilot/Cursor file edit parts) with Accept/Reject per file. (2) **Merge conflict widget** in chat with “Accept Current/Incoming” per conflict. (3) **Partial hunk accept** from chat card, not only editor. (4) Wire `propose_file_edit` approval to same component as `quantumide_stage_chat_edits`. |
| **Acceptance** | Agent proposes 3-file change → chat shows 3 cards → user accepts 2, rejects 1 → disk reflects exactly that; no orphan temp files in `.quantumide/diff-preview/`. |

### A10. Plugin / extension ecosystem — **P1**

| | |
|---|---|
| **Current** | `registerQuantumIDEPlugin`; host + client tools; demo plugin; MCP manifest; `search_external_retrieval`. |
| **Cursor-level** | Extension marketplace patterns; MCP servers in UI; tool toggles per session; documented stable API. |
| **Missing** | (1) **Settings → Extensions** lists plugins with enable/disable. (2) **Tool consent** per plugin. (3) **Versioned plugin manifest** schema. (4) **Dynamic reload** when extension registers plugin. (5) **Public docs** + example extension repo. |
| **Acceptance** | Third-party extension registers tool → appears in chat tool list → user can disable → host respects disable on next turn. |

---

## B. Feature parity spec (8 groups) — detailed gaps

### B1. Project & workspace awareness — **P1**

| | |
|---|---|
| **Current** | Workspace graph scan; `get_project_manifests`, `list_workspace_folders`; orchestrator “Project manifests” section (paths/kinds only). |
| **Cursor-level** | Rich project summary in context (deps, scripts, frameworks); monorepo awareness; `@package.json` style attachment. |
| **Missing** | (1) **Parsed manifest content** in automatic context every turn (not tool-only). (2) **Monorepo package boundaries** (npm workspaces, cargo workspace). (3) **Dependency version conflict** hints. (4) **Auto-attach** root manifest when agent mode starts. |
| **Acceptance** | New Agent chat on npm monorepo includes package name, scripts list, and workspace packages without calling `get_project_manifests`. |

### B2. File navigation & context — **P1**

| | |
|---|---|
| **Current** | `IQuantumIDEFileNavigationService` (flat list from index); tools open/browse/go-to; command “Browse Workspace in Chat”. |
| **Cursor-level** | **File tree in chat sidebar** or picker; `@file` autocomplete; recent files; click search hit → open. |
| **Missing** | (1) **Embedded file tree view** in chat panel (React component, lazy load). (2) **`@` mention provider** for workspace paths. (3) **Search result → peek** (`search_code_with_preview` opens editor peek, not text only). (4) **Multi-folder** roots in tree. |
| **Acceptance** | User types `@src/` → autocomplete paths; picks file → attached; search tool result click opens file at line. |

### B3. Code editing & refactoring — **P1**

| | |
|---|---|
| **Current** | Inline diff; `quantumide_stage_chat_edits` + multi-diff; `quantumide_preview_refactor`; LSP rename when enabled. |
| **Cursor-level** | Chat-driven multi-file Agent Edit; refactor preview with symbol graph; Apply All with rollback. |
| **Missing** | (1) **Unified edit pipeline** (propose_file_edit = stage_chat_edits = same UX). (2) **Batch apply with atomic rollback** exposed in chat. (3) **LSP refactor tools** for extract method/interface (not regex `extract_method` host tool only). (4) **Checkpoint UI** in chat (“Restore checkpoint …”). |
| **Acceptance** | Agent 5-file edit → single “Review changes” surface → Apply All / Reject All → one undo restores all. |

### B4. Contextual awareness — **P1**

| | |
|---|---|
| **Current** | Ranked orchestrator; live markers (20 cap); indexed diagnostics/comments; LSP symbol preview. |
| **Cursor-level** | Diagnostics drive agent “fix errors” loop; comments/docs in retrieval; always-fresh git diff in context. |
| **Missing** | (1) **Full workspace diagnostic budget** (ranked, not arbitrary 20). (2) **Re-sync diagnostics index** on marker change (incremental). (3) **“Fix all errors in file”** agent macro. (4) **Symbol-at-cursor** in every agent turn automatically. |
| **Acceptance** | Introduce error in file → next agent message context includes that error without manual @; “fix diagnostics” resolves indexed error. |

### B5. Testing & verification — **P1**

| | |
|---|---|
| **Current** | `discover_workspace_tests`; `run_workspace_check` (npm test/lint); `format_workspace` (prettier/npm). |
| **Cursor-level** | Test explorer integration; run single test from chat; parsed junit-style summary; “run tests” button after edits. |
| **Missing** | (1) **Run individual discovered test** by id from chat UI. (2) **Parse test output** into pass/fail counts (jest/vitest/pytest parsers). (3) **“Run tests affected by changed files”** heuristic. (4) **Format/lint results** as structured chat blocks, not raw terminal text. (5) **tasks.json** discovery UI. |
| **Acceptance** | After edit, user clicks “Run tests” in chat → sees “12 passed, 1 failed” + jump to failing test file:line. |

### B6. Code search & retrieval — **P1**

| | |
|---|---|
| **Current** | Semantic/symbol/vector tools; `search_code_with_preview` (text excerpts); comments/docs search. |
| **Cursor-level** | Fast codebase search; ranked results with signatures; codebase indexing always warm; “go to definition” from chat. |
| **Missing** | (1) **Sub-300ms retrieval SLA** enforced in CI on fixture repo. (2) **Unified search UI** in chat for semantic+symbol. (3) **Reference / implementation** navigation from results. (4) **Embeddings on full reindex** to Lance/incremental (today: incremental chunks on reindex but Lance path optional/incomplete on workbench). (5) **Tree-sitter** in `buildAstIndex` (cycle fix removed TS adapter from index path—restore properly). |
| **Acceptance** | Search “auth middleware” → top 5 results with signature preview → click → editor at definition; P95 retrieval <300ms on 10k-file fixture. |

### B7. Plugin & API integration — **P1**

| | |
|---|---|
| **See A10** | Same gaps; add **MCP server UI** in settings (list, connect, tool enablement per server). |

### B8. User experience & guidance — **P2**

| | |
|---|---|
| **Current** | `IQuantumIDEOnboardingService`; one notification; tool `quantumide_show_chat_onboarding`. |
| **Cursor-level** | Product tour; contextual tips; feature discovery in empty states; changelog in app. |
| **Missing** | (1) **Multi-step walkthrough** (chat, @, agent, diff). (2) **Empty-state hints** in chat panel. (3) **Tooltips on first use** of inline diff. (4) **Help links** in settings categories. |
| **Acceptance** | First launch shows 3-step tour; skippable; never repeats after completion stored. |

---

## C. PRD v2.0 subsystems — remaining Cursor-level gaps

### C1. Repository indexing at scale — **P0**

| | |
|---|---|
| **Current** | Standard 500 files / enterprise 50k caps; chunked scanner; TF-IDF + optional OpenAI embeddings; incremental vector store; Tree-sitter adapter exists but **AST index build uses regex fallback** after import cycle fix. |
| **Cursor-level** | Million-LOC repos; background indexing; always-on incremental; semantic search feels instant. |
| **Missing** | (1) **Dedicated indexer worker** (extension host or node worker) not blocking UI. (2) **Incremental AST/symbol update per file change**. (3) **Restore Tree-sitter in index pipeline** without cyclic imports (interface injection). (4) **Persist vectors on every reindex** including Lance when configured. (5) **Progress UI** in status bar (% indexed). (6) **Qdrant/Lance** production path tested at 100k+ chunks. |
| **Acceptance** | Open 30k-file repo → indexing continues in background → chat search usable before 100% complete; edit file → index updates <2s (PRD §6). |

### C2. Autonomous agent closed loop — **P1**

| | |
|---|---|
| **Current** | `iterateUntilComplete`; execution graph file; `run_workspace_check`; retry on error; activity log. |
| **Cursor-level** | Agent runs until tests pass or user stops; clear plan UI; subagents optional. |
| **Missing** | (1) **Mandatory verify step** after apply when setting enabled (enforce, not prompt-only). (2) **Graph UI** in chat (checklist with live status). (3) **Stop/Cancel** propagates to shell tests. (4) **Max spend / max steps** clear in UI. (5) **Subagent** or task delegation (PRD optional but Cursor has it). |
| **Acceptance** | Agent task “fix tests” → user sees checklist Planning→Verify → failed test triggers retry → success or explicit max continuations message. |

### C3. Terminal & sandbox — **P1**

| | |
|---|---|
| **Current** | Terminal output in context; `quantumideTerminalSandbox` (dangerous command block); approval flows partial. |
| **Cursor-level** | OS-level sandbox option; allowlist per workspace; command history in chat. |
| **Missing** | (1) **OS sandbox** (container/seatbelt) optional mode. (2) **Per-command approval memory** (“always allow npm test”). (3) **Structured terminal blocks** in chat (command + exit code + output). (4) **Cwd** and env injection per proposal. |
| **Acceptance** | `rm -rf /` blocked; `npm test` approvable once; chat shows terminal block with exit code 1 styled red. |

### C4. Security & privacy (PRD §5) — **P2**

| | |
|---|---|
| **Current** | Policies file, path exclusions, encrypted cache, local-only indexing flag. |
| **Missing** | Enterprise policy **enforcement tests**; audit export; **secret redaction** in context and logs. |
| **Acceptance** | `.env` never in semantic index; API keys in terminal output redacted in activity log. |

### C5. Performance CI (PRD §6) — **P1**

| | |
|---|---|
| **Current** | Performance marks; budget tests; enforce setting. |
| **Missing** | **CI gate** on PR: chat startup, semantic retrieval, inline completion, diff render budgets on fixture. |
| **Acceptance** | `quantumide-performance-ci` job fails PR if P95 exceeds PRD targets by >20%. |

### C6. Settings UX (PRD §3.7) — **P2**

| | |
|---|---|
| **Current** | 14 categories; live preview for values. |
| **Missing** | **Search across settings** highlights; **keyboard nav** audit; **sync** chat/agent settings with active session model picker. |
| **Acceptance** | Search “vector” finds indexing vector store; Enter applies focus trap compliant navigation. |

### C7. Transport & architecture (PRD §4.2) — **P2**

| | |
|---|---|
| **Current** | Event bus; gRPC/WS listed as recommended not deployed. |
| **Missing** | Remote agent host connection; **WebSocket** streaming for cloud models if product requires. |
| **Acceptance** | Document deployed vs planned; if remote host, latency and reconnect behavior specified. |

---

## D. Implementation checklist (ordered)

Use this order unless blocked; do not skip earlier P0/P1 items to implement P2 polish.

| Phase | IDs | Theme |
|-------|-----|--------|
| **1** | C1, A3 decision | Indexing scale + collaboration honesty |
| **2** | A9, B3, A1, A2 | Chat-native diff + unified edit pipeline + editor |
| **3** | B2, B6, B4 | Navigation, search SLA, diagnostics loop |
| **4** | B5, A7, C2 | Tests in chat, run blocks, agent verify UI |
| **5** | A4, A8, A5, B1 | Context chips, attachments, rich tool UI |
| **6** | A10, B7, C3 | Plugins, MCP UI, terminal blocks |
| **7** | B8, C5, C6 | Onboarding tour, performance CI, settings polish |

---

## E. Verification matrix (definition of done)

Each row must pass before marking the requirement **Done**.

| Area | Automated | Manual |
|------|-----------|--------|
| Editor apply/undo | E2E Playwright | Select→apply→undo |
| Chat diff cards | Integration | 3-file accept/reject mix |
| Indexing scale | Perf job on fixture | 10k+ files search while indexing |
| Tests from chat | Integration | jest monorepo single test run |
| Diagnostics loop | Unit + agent test | Introduce TS error, agent fixes |
| Collaboration | N/A or e2e | Two windows OR hidden from UI |
| Plugins | Extension test | Register tool, disable in settings |

---

## F. Document maintenance

When implementing a requirement:

1. Add **PR link** and **file paths** to `quantumide-chat-platform.md` (implementation map).
2. Mark requirement ID **Done** in this file with date and commit SHA.
3. If intentionally not pursuing Cursor parity, mark **Won’t fix** with product reason (do not leave stub UX).

---

*End of requirements. Implement exactly as specified; no shortcuts.*
