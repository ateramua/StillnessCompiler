# Development Requirement: In-Chat Agent Activity Status Messages (Cursor-Style)

**Document ID:** QPR-CHAT-ACTIVITY-001  
**Version:** 1.0  
**Status:** Implemented (2026-05-20) — see §6 gap table for optional UX polish  
**Related:** [quantumide-agent-task-phase-status.md](./quantumide-agent-task-phase-status.md) (status **bar**, outside chat)

---

## 1. Objective

When the AI agent works on a user task, QuantumIDE SHALL display **human-readable, real-time activity status** inside the **chat UI**—comparable to Cursor’s in-thread messages such as *Planning…*, *Thinking…*, *Grepping…*, *Grepped*, *Reading `file.ts`*, *Editing…*, *Running tests…*—so users always know what the agent is doing without opening logs or the status bar.

This requirement covers **in-chat** presentation only. Persistent status outside chat is specified separately (task phase status bar).

---

## 2. Scope

### In scope

| Area | Description |
|------|-------------|
| **Session-level activity** | High-level states while the model reasons or waits (e.g. Planning, Working, Thinking). |
| **Tool-level activity** | One status line per tool invocation: running → completed/failed/cancelled. |
| **Label catalog** | Canonical verbs per tool kind (search, read, edit, terminal, plan, subagent). |
| **Chat rendering** | How `IChatProgress` items appear in Agent Sessions / chat panel (shimmer, icons, collapse). |
| **Localization** | All user-visible strings via `nls` / `localize`. |
| **Verbosity** | minimal / normal / verbose detail in labels. |
| **Accessibility** | Screen reader announcements for phase changes. |
| **Configuration** | Enable/disable, verbosity, max steps per turn. |

### Out of scope

| Area | Rationale |
|------|-----------|
| Status bar task phases | Covered by `quantumide.ai.agent.taskPhaseStatus.*` |
| Agent host protocol design | Assumes existing `SessionAction` stream |
| Changing LLM tool schemas | Labels map to existing tool names |

---

## 3. Reference behavior (Cursor parity)

Users expect a **chronological activity feed** embedded in the assistant turn:

1. **Ephemeral “current step”** — Often one shimmering line for the active phase (*Planning…*, *Grepping for `foo`*).
2. **Completed steps** — Past tense, compact (*Grepped*, *Read `api.ts`*, *Edited `index.ts`*), usually remain visible but de-emphasized.
3. **Tool grouping** — Related tools may collapse under a parent step; subagents show nested activity.
4. **No spam** — Rapid tool bursts coalesce or cap visible steps per turn.
5. **Failure clarity** — Failed step shows error tone and short reason (*Grep failed*, *Command failed*).

---

## 4. Functional requirements

### FR-1 — Activity message taxonomy

The system SHALL support the following **activity kinds**, each with **running**, **completed**, **failed**, and **cancelled** label variants:

| Kind | Running examples | Completed examples | Icon (codicon) |
|------|------------------|--------------------|----------------|
| `plan` / `reasoning` | Planning…, Thinking… | Planned | `sparkle` |
| `search` | Grepping, Grepping for `{query}` | Grepped, Grepped (N matches) | `search` |
| `read` | Reading `{file}` | Read `{file}` | `go-to-file` |
| `edit` | Editing `{file}` | Edited `{file}` | `edit` |
| `terminal` | Running command / terminal command | Ran command | `terminal` |
| `subagent` | Running subagent | Ran subagent | `hubot` |
| `tool` (generic) | Running `{toolName}` | Ran `{toolName}` | `tools` |
| `error` | — | `{step} failed` | `error` |

**SHALL** map every registered agent/host tool name to a kind via a single registry (`getAgentActivityKind`).

**SHALL** allow QuantumIDE-specific tools (`quantumide_*`, `grep`, `codebase_search`, etc.) to map to the same kinds as VS Code/Cursor equivalents.

---

### FR-2 — Session-level status (non-tool)

While no tool is running, the chat UI SHALL show session activity from the agent host:

| Host activity | Chat label (normal) | Shimmer while active |
|---------------|---------------------|----------------------|
| `thinking` | Planning… | Yes |
| `working` | Working… | Yes |
| Custom host string | Pass-through localized if known | Yes |

**SHALL** emit `IChatProgress` items of kind `progressMessage` with `shimmer: true` for active session activity.

**SHALL** clear or replace shimmer when activity changes or the turn completes.

---

### FR-3 — Tool invocation status (per tool call)

For each `SessionToolCallStart` → `Ready` → `Complete` cycle, the chat UI SHALL:

1. **On start** — Insert a `ChatToolInvocation` (or update existing) with `invocationMessage` = **running** label from FR-1.
2. **On ready** (input available / awaiting confirm) — Update message; show confirmation UI when required without losing activity label.
3. **On complete** — Set **completed** or **failed** label; stop spinner; optionally hide after complete per presentation policy.
4. **On cancel** — Show **cancelled** label.

**SHALL** use `resolveAgentActivityProgressMessage` / `localizeAgentActivityProgressMessage` as the single source of truth for English fallback and i18n.

**SHALL** append search match counts to completed grep labels when host output contains `Found N match` (FR-13).

---

### FR-4 — Display location and layout (chat UI)

| ID | Requirement |
|----|-------------|
| FR-4.1 | Activity messages SHALL appear **inside the active assistant response**, above or interleaved with tool cards, not only in the status bar. |
| FR-4.2 | The **currently running** step SHOULD be visually distinct (shimmer, spinner, or accent color). |
| FR-4.3 | Completed steps SHOULD remain in the thread in **collapsed or muted** style (Cursor: grey check / one-line summary). |
| FR-4.4 | Tool invocations SHALL use `ToolInvocationPresentation.HiddenAfterComplete` or `Expanded` per tool category (search: hidden; terminal: expanded with output). |
| FR-4.5 | Subagent tools SHALL render nested progress under a parent invocation (`toolSpecificData.kind === 'subagent'`). |

---

### FR-5 — Real-time updates

| ID | Requirement |
|----|-------------|
| FR-5.1 | Label updates SHALL appear within **200 ms** of host `SessionAction` delivery under normal load. |
| FR-5.2 | The UI SHALL subscribe to `progressObs` / turn progress sink without requiring a full chat reload. |
| FR-5.3 | Reconnected sessions SHALL replay accumulated progress so activity history is not lost. |

---

### FR-6 — Verbosity and detail

Setting: `quantumide.ai.agent.activityVerbosity` = `minimal` | `normal` | `verbose` (default: `normal`).

| Verbosity | Behavior |
|-----------|----------|
| **minimal** | Short verbs only: Grepping, Grepped, Ran command |
| **normal** | File basename and query in backticks when available |
| **verbose** | Full paths, commands, optional JSON arg snippet in detail line |

Env override: `QUANTUMIDE_AGENT_ACTIVITY=minimal|verbose`.

---

### FR-7 — Rate limiting and coalescing

| ID | Requirement |
|----|-------------|
| FR-7.1 | **SHALL** cap visible tool activity steps per turn (default **50**, configurable). |
| FR-7.2 | When cap exceeded, **SHALL** merge additional tools into a summary line (*Ran 12 more tools…*). |
| FR-7.3 | Duplicate identical consecutive labels **SHOULD** coalesce within 300 ms (optional enhancement). |

---

### FR-8 — Planning mode and execution graph

When chat mode is `planning` or an execution graph is active:

| ID | Requirement |
|----|-------------|
| FR-8.1 | Graph phase transitions (`planning`, `retrieval`, `modify`, `verify`) **SHOULD** emit a chat `progressMessage` (*Planning retrieval…*, *Applying changes…*). |
| FR-8.2 | Orchestrator checklist steps **MAY** map to activity lines (*Step 2/5: Searching codebase*). |

---

### FR-9 — User interaction

| ID | Requirement |
|----|-------------|
| FR-9.1 | Clicking a file-bearing activity line **SHOULD** open the file at the referenced line when parseable. |
| FR-9.2 | Clicking a failed step **SHOULD** expand tool error output if present. |
| FR-9.3 | Users **SHALL** be able to disable in-chat activity via settings without breaking the agent. |

---

## 5. Non-functional requirements

| ID | Category | Requirement |
|----|----------|-------------|
| NFR-1 | Performance | Rendering activity lines **SHALL NOT** block the editor UI thread >16 ms per update. |
| NFR-2 | Performance | 100 tool steps in one turn **SHALL** complete UI updates in <2 s total. |
| NFR-3 | Accessibility | `progressMessage` **SHALL** use `role="status"`; completed/failed **SHALL** use `aria-live="polite"`. |
| NFR-4 | Accessibility | Shimmer-only state **SHALL** have a non-animated fallback when `prefers-reduced-motion` is set. |
| NFR-5 | i18n | 100% of catalog strings **SHALL** go through `nls.localize`. |
| NFR-6 | Security | Activity labels **MUST NOT** embed secrets (API keys, tokens); paths **MAY** be basename-only in normal verbosity. |
| NFR-7 | Reliability | Missing tool mapping **SHALL** fall back to generic *Running {toolName}* / *Ran {toolName}*. |

---

## 6. Architecture

```
Agent host (openAiAgent)
  SessionAction: activity | ToolCallStart | ToolCallReady | ToolCallComplete
        ↓
OpenAIRawToolProgressRouter / stateToProgressAdapter
  getAgentActivityLabel · resolveAgentActivityProgressMessage
  localizeAgentActivityProgressMessage (workbench)
        ↓
IChatProgress[]  →  agentHostSessionHandler.progressObs
        ↓
Chat renderer (Agent Sessions widget)
  progressMessage (shimmer) + ChatToolInvocation rows
```

### Key modules (existing baseline)

| Module | Role |
|--------|------|
| `agentActivityLabels.ts` | Label catalog + tool→kind map |
| `agentActivityLocalizedLabels.ts` | Localized chat strings |
| `openaiRawToolProgress.ts` | Raw tool → `IChatProgress` |
| `stateToProgressAdapter.ts` | Tool call state → invocation message |
| `agentHostSessionHandler.ts` | Session activity → `progressMessage` |
| `agentHostChatContribution.ts` | Wires verbosity + activity logger |

### Implementation status (gaps closed)

| Gap | Requirement ID | Status |
|-----|----------------|--------|
| Distinct **Thinking…** / **Reasoning…** / **Working…** | FR-2 | Done |
| Session activity dedup (reduce stack spam) | FR-4.2 | Done |
| Collapsed history (VS Code hides earlier `progressMessage` when tools follow) | FR-4.3 | Built-in |
| Coalescing identical steps (300 ms) | FR-7.3 | Done |
| Cap + “Ran N more tools…” summary | FR-7.1–7.2 | Done |
| Execution graph + orchestrator → chat `progressMessage` | FR-8 | Done |
| Open file command `quantumide.chat.openActivityPath` | FR-9.1 | Done |
| `quantumide_*` tools in activity kind map | FR-1 | Done |
| `quantumide.chat.agentActivity.enabled` | FR-9.3 | Done |
| Reduced-motion CSS for shimmer | NFR-4 | Done |

---

## 7. Configuration

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `quantumide.ai.agent.activityVerbosity` | enum | `normal` | Label detail level |
| `quantumide.ai.agent.activityDebugOutput` | boolean | `false` | Mirror activity to output channel |
| `quantumide.ai.agent.maxActivityStepsPerTurn` | number | `50` | Cap tool lines per turn |
| `quantumide.chat.agentActivity.enabled` | boolean | `true` | Master switch for in-chat activity UI |
| `quantumide.ai.agent.taskPhaseStatus.enabled` | boolean | `true` | **Separate**: status bar phases |

---

## 8. Data model (chat progress)

### `progressMessage` (session-level)

```typescript
{
  kind: 'progressMessage',
  content: MarkdownString,  // e.g. "Planning…"
  shimmer?: boolean         // true while in-flight
}
```

### `ChatToolInvocation` (tool-level)

```typescript
{
  invocationMessage: string,  // running label
  // on complete: updated via didExecuteTool → completed label
  presentation: HiddenAfterComplete | Expanded,
  toolSpecificData?: terminal | subagent | input
}
```

---

## 9. Acceptance criteria

### AC-1 — Session activity

- [ ] Starting a turn shows **Planning…** or **Working…** with shimmer within 500 ms.
- [ ] Shimmer stops when the first tool starts or the turn ends.

### AC-2 — Search tools

- [ ] `grep` / `search_workspace_text` shows **Grepping for `{query}`** then **Grepped** (with match count when available).

### AC-3 — Read / edit tools

- [ ] `read_workspace_file` shows **Reading `{basename}`** then **Read `{basename}`**.
- [ ] `propose_file_edit` / `apply_workspace_edits` shows **Editing** / **Edited** with basename.

### AC-4 — Terminal tools

- [ ] Terminal tool shows running then completed/failed; output block expandable.

### AC-5 — Failure and cancel

- [ ] Failed tool shows failed label and error styling.
- [ ] Cancelled turn shows cancelled labels, not stuck on “Grepping”.

### AC-6 — Verbosity

- [ ] `minimal` hides paths/queries; `verbose` shows extra detail per FR-6.

### AC-7 — Limits

- [ ] Turn with >50 tools does not freeze UI; summary or cap applies.

### AC-8 — Accessibility

- [ ] VoiceOver/NVDA announces phase change on new `progressMessage`.
- [ ] Reduced motion disables shimmer animation.

### AC-9 — Settings

- [ ] Disabling `quantumide.chat.agentActivity.enabled` hides activity UI; agent still runs.

---

## 10. Verification

### Automated

```bash
# Label catalog unit tests (extend as tools added)
npm run test-node -- --run src/vs/platform/quantumide/test/common/agentActivityLabels.test.ts  # add if missing

# Existing related tests
npm run test-node -- --run src/vs/workbench/contrib/chat/test/browser/agentSessions/agentActivityLabels.test.ts
npm run test-node -- --run src/vs/workbench/contrib/chat/test/browser/agentSessions/openaiRawToolProgress.test.ts
```

### Manual (smoke)

1. Open Agent Sessions, send: *“Search the repo for `QuantumIDE` and read the main readme.”*
2. Confirm in-chat sequence resembles: Planning… → Grepping… → Grepped → Reading… → Read …
3. Fail a command (invalid path); confirm **Failed to read** appears.
4. Toggle verbosity minimal/verbose in settings; confirm label length changes.

---

## 11. Traceability matrix

| Requirement | Existing implementation | Gap |
|-------------|-------------------------|-----|
| FR-1 Label catalog | `agentActivityLabels.ts` | Register all `quantumide_*` tools |
| FR-2 Session shimmer | `agentHostSessionHandler` `progressMessage` | Distinct Thinking label |
| FR-3 Tool labels | `openaiRawToolProgress`, `stateToProgressAdapter` | Complete on `_handleStart` args from toolInput |
| FR-4 Chat layout | VS Code chat renderer | Sticky current step + collapse UX |
| FR-6 Verbosity | `AgentActivityVerbosity` setting | Chat-only disable setting |
| FR-7 Cap | `_maxActivityStepsPerTurn` | Summary line when capped |
| FR-8 Graph | `executionGraph` + task phase bridge | Emit chat `progressMessage` |
| Status bar | `quantumideAgentTaskPhase*` | Not a substitute for in-chat |

---

## 12. Deliverables

1. Gap implementation PR(s) per §6 backlog.
2. Unit tests for label mapping and progress message resolution.
3. Screenshot/video UAT checklist (append to §9).
4. Update [quantumide-production-requirements-traceability.md](./quantumide-production-requirements-traceability.md) row for chat activity.

---

## 13. Sign-off

| Role | Name | Date | Notes |
|------|------|------|-------|
| Product | | | Cursor parity accepted / gaps listed |
| Engineering | | | All AC pass |
| QA | | | Manual smoke + a11y |

---

**End of requirement**
