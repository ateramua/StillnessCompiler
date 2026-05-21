# QuantumIDE Chat Platform (Chat Panel Re-engineering)

Implementation map for `docs/ChatPanelRe-engineering.md` v2.0.

**Cursor-level gap spec (normative for remaining work):** [quantumide-cursor-level-gap-requirements.md](./quantumide-cursor-level-gap-requirements.md) — detailed requirements for everything still partial vs Cursor; **no shortcuts**.

**Chat panel Cursor parity UI (v3 checklist):** [quantumide-chat-panel-cursor-parity-ui-v3.md](./quantumide-chat-panel-cursor-parity-ui-v3.md) — workspace/SCM/tests/deps/navigation hub and gap notes for agent step-through.

**Production-grade requirements specification (normative, full):** [quantumide-production-grade-requirements-specification.md](./quantumide-production-grade-requirements-specification.md) — every missing/incomplete feature, expected behavior, failure/recovery, UX polish, architecture, and acceptance criteria (`QPR-*` IDs).

**Production requirements traceability (status matrix):** [quantumide-production-requirements-traceability.md](./quantumide-production-requirements-traceability.md) — Done / Partial / Planned per clause with file references.

## Chat parity dock (embedded strip)

Mounted above the interactive session from `QuantumIDEChatParityDock`:

- **No workspace**: only the **Get started** card is shown (Open Folder, Clone Repository, Open Recent). Workspace tree, batch/AI diff tools, symbols, tests/lint, SCM, dependency snapshot, plugins, docs, and guidance stay **hidden** so internal panels never appear as empty chrome.
- **Workspace open**: sections **reveal when actionable** — e.g. Inline Suggestions & Batch Edits only when there is an active inline proposal or pending chat batches; Source Control only when at least one repository exists; dependency snapshot when `IQuantumIDESemanticIndexService.getDependencyGraph()` has nodes; contextual extensions only when a file-type recommendation applies; tests/lint only when there is a test run, problem markers/diagnostics on the active file, or indexed coverage data.
- **Copilot parity**: delegates to VS Code inline completion commands (`editor.action.inlineSuggest.*`) from the dock when an editor resource is active; works with Copilot/other providers that hook the same mechanism.
- **Visualization**: dependency snapshot uses `formatDependencyGraphSummary`; the sidebar **QuantumIDE Chat Parity** dependency tree refreshes on semantic index updates as well as workspace graph changes.
- **Workspace rename preview**: `vscode_renameSymbol` now stages multi-file rename edits into pending chat batches by default and opens a visual diff review before apply; per-file accept/reject commands remain available in the dock batch section.

### Production dock sections (8 requirement areas)

| Area | Service | Dock UI |
|------|---------|---------|
| **Projects & workspace** | `IQuantumIDEProjectManagerService` — add/remove/open folders, recent list, busy/error state | Interactive folder list, recent projects, Open/Add actions |
| **File explorer** | `IQuantumIDEFileExplorerTreeService` — hierarchy, move/rename, workspace search | `ParityVirtualTree` — filter, virtual scroll, multi-select, keyboard nav, drag-and-drop move |
| **Refactoring** | `IQuantumIDERefactorWorkflowService` — catalog + history | Per-refactor rows with Run + review pending edits |
| **Tests & lint** | `IQuantumIDEChatTestPanelService` — native `ITestResultService` items, filter | Pass/fail list, jump-to-line, run/debug actions |
| **SCM** | `IQuantumIDEChatScmPanelService` — branch from `historyProvider`, file status | Staged/unstaged/conflict files, `git.openChange`, branch line |
| **Plugins** | `IQuantumIDEChatPluginMarketplaceService` — registry + installed extensions | Search, enable/disable, manage |
| **Context & history** | `IQuantumIDEChatRichUiService` — persisted cards/threads in workspace storage | Pin/remove cards, add workspace context |
| **Snapshots & timeline** | `IQuantumIDEWorkspaceSnapshotService` + `IQuantumIDEWorkspaceStateService` | Visual timeline, inline diff preview, restore/delete, session restore |
| **Collaboration & sync** | `IQuantumIDECollaborationService` | Encrypted `.quantumide/collab/`, presence, sync queue, conflict resolution, dock + agent tool |
| **Agent task orchestration** | `IQuantumIDEAgentTaskOrchestratorService` | Plan/steps, progress bar, pause/resume/abort, per-step snapshot rollback; chat bridge + `quantumide_agent_task` tool |
| **Guidance** | `IQuantumIDEOnboardingService` — contextual tips + tour steps | Context-driven tips (SCM dirty, failed tests, pending edits) |

Commands: `quantumide.chat.addWorkspaceFolder`, `openWorkspaceFolder`, `removeWorkspaceFolder`, `togglePlugin`, `addContextCard`, `pinContextCard`, `onboardingNext` / `onboardingSkip`.

## §2.0 Product vision

Embedded subsystem via chat panel, agent host, context orchestrator, indexing, and multi-file edit engine (not a detached chatbot).

## §2.1 Embedded AI Chat Panel

- Modes: Ask, Edit, Agent, Refactor, Review, Terminal, Planning (Ask registered on QuantumIDE agent host).
- Agent Host mode-specific system addons; context/policy attachments for all providers when running QuantumIDE product.
- Streaming via OpenAI agent / chat UI.

## Cursor chat panel parity (10 requirements)

| # | Capability | Implementation |
|---|------------|----------------|
| 1 | Direct editor manipulation | Client tool `quantumide_edit_active_editor` + `IQuantumIDEActiveEditorService` (insert/replace at cursor/selection) |
| 2 | Inline suggestions & code actions | Inline diff service + code action provider (Explain, Fix, Optimize, Tests) + tool `quantumide_show_inline_suggestion` |
| 3 | Real-time collaboration | `IQuantumIDECollaborationService` (`.quantumide/collab/{sessionId}.json`) + tool `quantumide_collab_sync` + Start/Join commands |
| 4 | Editor state context | `IQuantumIDEEditorStateService` in context orchestrator + tool `quantumide_get_editor_state` |
| 5 | Rich UI interactions | Code actions in lightbulb menu; inline diff decorations; merge/diff commands |
| 6 | Command palette integration | Client tool `quantumide_execute_workbench_command` |
| 7 | Live preview / execution | `IQuantumIDELivePreviewService` + tool `quantumide_run_code_preview` (terminal capture) |
| 8 | Drag-and-drop & uploads | Built-in chat `ChatDragAndDrop` + `quantumide.chat.attachFiles` command hint |
| 9 | Visual diff & merge | `IQuantumIDEDiffReviewService` + tools `quantumide_open_visual_diff`, `quantumide_merge_conflict` |
| 10 | Plugin / extension ecosystem | `registerQuantumIDEPlugin` host + **client** tools via `quantumidePluginClientTools.contribution` |

Settings: `quantumide.chat.cursorParity.enabled` (default on), `quantumide.chat.collab.enabled`, `quantumide.chat.attachments.enabled`.

## Feature parity spec (8 requirement groups)

| Group | Capability | Implementation |
|-------|------------|----------------|
| **1. Project & workspace** | Manifest detection, multi-folder | Workspace graph + `get_project_manifests`, `list_workspace_folders` host tools; project section in context orchestrator |
| **2. File navigation** | File tree, quick open | `IQuantumIDEFileNavigationService`; client tools `quantumide_open_file`, `quantumide_browse_workspace_tree`, `quantumide_go_to_line`; command **Browse Workspace in Chat** |
| **3. Code editing** | Inline + multi-file refactor | Inline diff + `quantumide_stage_chat_edits`, `quantumide_preview_refactor`; `IQuantumIDEChatInlineEditService` |
| **4. Context** | Auto injection, live diagnostics | Context orchestrator (editor, selection, manifests, LSP); live marker diagnostics + indexed diagnostics tools |
| **5. Tests & quality** | Discover, run, lint, format | `discover_workspace_tests`, `run_workspace_check`, `format_workspace` host tools |
| **6. Search** | Semantic/symbol + docs | `search_code_with_preview`, `search_workspace_documentation`, comments/diagnostics search |
| **7. Plugins** | Third-party in chat | `registerQuantumIDEPlugin`, `search_external_retrieval`, `quantumide_list_plugins` |
| **8. UX** | Onboarding, visual diff | `IQuantumIDEOnboardingService`, `quantumide_show_chat_onboarding`; multi-diff review |

Setting: `quantumide.chat.featureParity.enabled` (default on).

## §2.2 / §2.10 Context & real-time sync

- `IQuantumIDEChatContextOrchestrator` with ranked token budget (`quantumideContextRanker.ts`).
- Live: editor, selection, diagnostics, SCM, git branch, tabs, terminals, terminal output + parsed insights, navigation, file history, LSP, workspace symbol index, dependency graph preview.
- **Indexed diagnostics & comments** in ranked context (`quantumideChatContextOrchestrator.ts`); host tools `search_workspace_comments`, `search_workspace_diagnostics`.
- Incremental file-watch updates; `quantumide.chat.syncRealtime`, `quantumide.chat.tokenBudget`.
- `ChatStartup` / `ChatContextBuild` performance marks.

## §2.3 Repository indexing

- Semantic (TF-IDF), vector (local hashed or **OpenAI `text-embedding-3-small`** when `quantumide.indexing.embeddingProvider` is `openai` and API key is set), AST/symbol index, dependency graph under `.quantumide/`.
- **Scale profiles**: `quantumide.indexing.scaleProfile` = `standard` (500 files, 48k chars/file, depth 6) or `enterprise` (50k files, 200k chars/file, depth 14, batched scan with yield).
- **Chunked scanner**: `quantumideChunkedIndexScanner.ts` replaces recursive folder walk for large repos.
- Overrides: `quantumide.indexing.maxFiles`, `quantumide.indexing.maxFileChars`.
- **Sharded semantic cache**: `.quantumide/semantic-shards/` + monolithic `semantic-index.json`.
- **Comments index**: `.quantumide/comments-index.json`.
- **Diagnostics index**: `.quantumide/diagnostics-index.json` (from workspace markers).
- **Git metadata** v2 in `.quantumide/git-index.json` (counts + project/manifest paths).
- `.gitignore` + exclude patterns; incremental updates.
- **Tree-sitter WASM** parser adapter (`quantumideTreeSitterParserAdapter.ts`) with regex fallback.
- **Vector store modes**: `quantumide.indexing.vectorStore` = `json` | `incremental` (chunked `.quantumide/vector-store/`, default) | `lancedb` (optional `@lancedb/lancedb` on agent-host; incremental fallback).
- Host retrieval: semantic, vector, symbols, references, implementations, imports, dependency graph, type hierarchy, architectural patterns, plugin retrieval, **comments**, **diagnostics**.
- Commands: Reindex, Inspect cache, Clear cache.

## §2.4 / §2.8 Multi-file editing & diff

- `apply_workspace_edits`: atomic rollback, syntax validation, conflict detection, formatting preservation, path policies, **encoding preservation** (`quantumideFileEncoding.ts`).
- `apply_workspace_patch`, checkpoints, `restore_workspace_checkpoint`.
- Host refactor/edit tools including **`rename_symbol`**; workspace LSP rename via client **`rename`** tool.
- **`propose_file_edit`**: MultiDiff preview on approval request; applies via `applyQuantumIDEWorkspaceEdits` when approved.
- **`IQuantumIDEDiffReviewService`**: MultiDiffEditor review for clipboard/file edit proposals.
- Inline diff: resource diff editor (side-by-side), unified diff, **inline hunk comment decorations**, incremental hunk apply to buffer.
- **AST-aware patches**: `quantumideAstPatch.ts` + `apply_workspace_patch` / approved `propose_file_edit` with `+++ REPLACE` / `+++ WITH` hunks (`quantumide.chat.diff.partialHunks`).

## §2.5 Inline editing

- **`IQuantumIDEInlineEditorService`**: calls `ILanguageModelsService` → **`IQuantumIDEInlineDiffService`** (no clipboard path for code-only).
- Commands: explain, optimize, rewrite, refactor, tests, docs, convert syntax, migrate framework.
- **Inline model routing**: `quantumide.ai.modelRouter.taskRoutes.inline` via `quantumideInlineModelSelect.ts`.
- **`quantumide.chat.inline.ghostText`**: optional ghost preview of proposed hunk line in editor.
- `IQuantumIDEInlineDiffService`: hunks, accept/reject/accept-hunk (incremental), side-by-side + unified preview, hunk comments.

## §2.6 Autonomous agent

- Lifecycle prompts; **execution graph** in session config + `.quantumide/execution-graph.json` from Planning checklists; **tool lifecycle** updates node status (`running` / `done` / `failed`) via `quantumideExecutionGraphStore.ts`.
- **`quantumide.agent.iterateUntilComplete`**: extra continuation rounds when verification fails or graph has pending steps.
- `run_workspace_check`: compile, lint, test, verify, custom; **`.vscode/tasks.json` integration** when labels match.
- **`quantumide.agent.retryOnError`**: up to 3 attempts for checks and apply tools.
- Review mode: SCM change summary attachment.

## §2.7 Terminal

- Terminal sessions + output cache; parsed errors/stack traces in context.
- **`quantumideTerminalSandbox.ts`**: dangerous-command block, cwd lock, optional command allowlist.
- Approval flows via agent host.

## §2.9 Refactoring

- Host: `rename_symbol`, `normalize_imports`, `rewrite_imports`, `extract_method`, `extract_component`, `move_module`, `migrate_api`, `migrate_framework`.
- **`quantumide.agent.refactorAutoVerify`**: compile check after successful refactor host tools.
- **`quantumide.agent.preferLspRename`**: system guidance + `rename_symbol` `workspaceWide` defers to client LSP `rename`.
- Workspace LSP rename: client `rename` tool auto-exposed for QuantumIDE + `chat.tools.renameTool.enabled`.

## §3 Settings

- Multi-panel settings: **all 14 categories** in sidebar including **Workspace** and **Security**.
- Live preview for all major categories (`quantumideSettingsPreview.ts`).
- Model routing (`taskRoutes` per chat/agent/inline/review/indexing), indexing controls, privacy, experimental performance.
- Accounts category preview: default provider + VS Code sign-in guidance.
- Keybindings: import/export JSON, workspace overrides, context-aware conflict detection.

## §4 System architecture

- Layers, `IQuantumIDEPlatformService`, tech stack adapters, model gateway, architecture command.

## §5 Security & privacy

- `quantumideSecurity.ts`, `.quantumide/policies.json`, encrypted cache, local-only indexing, path policies on edits.

## §6 Performance

- Budgets + marks; shared `globalThis` store; auto-sample on empty performance report.
- **`quantumide.performance.enforceBudgets`**: throws on budget exceed (wired in `quantumidePerformance.contribution.ts`).
- Semantic search wrapped in `runWithBudget` (300ms); unit tests in `quantumidePerformanceBudgets.test.ts`.
- `InlineCompletion` mark on inline AI request.

## §7 Extensibility

- Plugin registry with host tools; demo plugin; list plugins command; public API `quantumidePluginApi.ts`.
- **`search_external_retrieval`**: dedicated host tool for plugin `retrievalProvider` search.
- **MCP bridge**: `.quantumide/mcp-tools.json` manifest + MCP tools loaded on agent host (`loadQuantumIDEMcpOpenAITools`).

## §8 Success criteria

Validated by integrated subsystem: embedded chat/agent, multi-file edits with rollback, indexing/retrieval, terminal verification, reversible diff workflows, synchronized context.

## Recommended stack notes (§4.2)

- **Tree-sitter**: active via `@vscode/tree-sitter-wasm` when grammars enabled.
- **Embeddings**: local 256-dim hashed or OpenAI API when configured.
- **Vector DB**: incremental chunked store (workbench reindex) + optional LanceDB on agent-host (`quantumideLanceVectorStore.ts`); monolithic JSON when `vectorStore` = `json`.

## Tests

`quantumideWorkspaceEdits.test.ts`, `quantumideSemanticIndex.test.ts`, `quantumideWorkspacePatches.test.ts`, `openaiHostTools.test.ts`, `quantumideLayers.test.ts`, `quantumideModelGateway.test.ts`, `quantumideTechStackAdapters.test.ts`, `quantumideSecurity.test.ts`, `quantumideCacheEncryption.test.ts`, `quantumideDiffHunks.test.ts`, `quantumideKeybindingConflicts.test.ts`, `quantumidePerformanceMarks.test.ts`, `quantumidePerformanceBudgets.test.ts`, `quantumideAstPatch.test.ts`, `quantumideAgentVerifyLoop.test.ts`

## FocusForge parity matrix (Cursor vs QuantumIDE)

This section captures the specific maturity gaps to close for Cursor-level parity in FocusForge scenarios.

### 1) Missing or less mature capabilities (current state)

- **Inline code actions & suggestions**
  - Cursor: richer in-editor one-click quick-fix/refactor affordances with highly discoverable accept/reject loops.
  - QuantumIDE: inline suggestions and diff accept/reject exist; advanced refactor affordances are present but less discoverable in some workflows.

- **Live codebase indexing & navigation**
  - Cursor: always-on, low-latency symbol/navigation behavior.
  - QuantumIDE: indexing is robust; large workspace updates can still feel less immediate and some navigation affordances are less tightly coupled to chat.

- **Automated multi-step refactoring**
  - Cursor: often performs complex multi-file refactors from a single intent.
  - QuantumIDE: multi-file edits and coordinated refactors are supported, but certain framework-specific scenarios still require more guided confirmations.

- **Rich UI for edit previews**
  - Cursor: highly interactive visual preview UX.
  - QuantumIDE: diff preview and review flows are present; visual density/granularity is improving but not yet uniformly equivalent.

- **Third-party plugin ecosystem**
  - Cursor: broader ecosystem depth in some verticals.
  - QuantumIDE: plugin framework is in place with retrieval + MCP bridge; catalog breadth is still growing.

- **Context awareness and auto-expansion**
  - Cursor: aggressive automatic expansion for ambiguous prompts.
  - QuantumIDE: context orchestration is strong, with deeper expansion still more prompt-driven in some cases.

- **Onboarding and help**
  - Cursor: guided onboarding/tooltips are mature.
  - QuantumIDE: onboarding exists and is improving, with guided tours still expanding in depth.

### 2) Workflows still less mature or missing

- Instant one-click diagnostics-to-fix loops from Problems panel in all languages/toolchains.
- Fully seamless test-driven loops (generate tests, run, repair, rerun) without manual orchestration.
- Production-grade live collaboration parity across broader editing/review scenarios.
- Deeper framework-specific agentic workflows (for example, route scaffolding, migration chains).
- End-to-end cloud deploy/CI workflow depth from chat parity surfaces.

### 3) Areas where QuantumIDE is strong

- Agentic multi-step execution with planning/retrieval/edit/verify/review loops.
- Workspace-wide refactor + dependency-aware operations with explicit review safety.
- Strong code search/navigation/batch edit tool surface.
- Reviewable patch and edit proposal safety model.

### 4) Summary table

| Feature/Workflow | Cursor | QuantumIDE (current) |
|---|---|---|
| Inline quick-fix/refactor | Mature | Partial/manual in some paths |
| Multi-file refactor | Mature | Mature with explicit review gates |
| Live codebase index | Mature | Robust, still improving immediacy on large changes |
| Plugin ecosystem | Mature | Present, smaller catalog depth |
| Test/codegen workflows | Mature | Partial/manual orchestration in some flows |
| Cloud/CI integrations | Partial-to-mature (context-dependent) | In progress |
| Agentic multi-step execution | Partial-to-mature (context-dependent) | Mature |
| Diff/preview UI | Mature | Robust, still improving interaction richness |
| Onboarding/help | Mature | Present, expanding interactivity |

Legend:
- **Mature**: complete and broadly seamless.
- **Partial/manual**: implemented but requires additional user guidance or extra steps.
- **In progress**: active implementation track.
