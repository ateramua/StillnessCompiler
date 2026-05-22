# QuantumIDE chat panel performance instrumentation

## What “slow” means (measurable dimensions)

| Dimension | What to measure | Primary marks |
|-----------|-----------------|---------------|
| Context build | Workspace discovery before agent invoke | `context/buildWillStart` → `context/buildDidComplete` |
| UI response | Submit → request row visible | `request/start` → `request/uiUpdated` |
| Message render | First token → final paint | `request/firstToken` → `render/messageComplete` |
| Streaming lag | Chunk arrival → list render pass | `stream/chunkReceived` → `render/chunk` |
| Memory growth | Heap at start vs end of turn | logged on `request/complete` |
| UI jank | Long gap between rAF frames after render | `render/uiReflow` (when gap ≥ 32ms) |
| Network latency | Agent / API round-trip | `agent/willInvoke` → `agent/didInvoke` |

## Enable logging

**Settings** (search “chat performance”):

- `quantumide.chat.perfInstrumentation.enabled` — write to **QuantumIDE Chat Performance** output (default: on)
- `quantumide.chat.perfInstrumentation.verbose` — log every stream chunk and render pass
- `quantumide.chat.perfInstrumentation.logToConsole` — mirror to DevTools (`console.time` / `console.log`)

**Commands** (Command Palette):

- `QuantumIDE: Show Chat Performance Log`
- `QuantumIDE: Dump Chat Performance Marks to Console` — dumps `code/chat/*` `performance.mark` entries

## Chrome DevTools (Electron)

1. **Help → Toggle Developer Tools**
2. **Performance** tab → Record while sending a chat message and receiving a stream
3. Look for: long main-thread tasks, layout/reflow, markdown/highlight cost
4. Optional: enable `logToConsole` and correlate `console.time('chat:…:response')` with the recording

## Implementation

- Marks: `src/vs/workbench/contrib/chat/common/chatPerf.ts`
- Logging & summaries: `src/vs/workbench/contrib/chat/common/chatPerfInstrumentation.ts`
- QuantumIDE output channel: `src/vs/workbench/browser/quantumideChatPerf.contribution.ts`

Regression harness (existing): `npm run perf:chat` in `quantumide/`.

## E2E suite (Playwright)

From `desktop-playwright-suite-repo`:

```bash
npm run test:e2e:managed:quantumide:chat-panel
```

- Spec: `desktop-e2e-qa/apps/quantumide/tests/chat-panel-performance-and-workspace.spec.js`
- Report: `desktop-e2e-qa/test-results/quantumide/chat-panel-performance-report.json`
- Workspace fixtures: `desktop-e2e-qa/test-workspaces/chat-panel-suite/` (files prefixed `chat-panel-suite-*`)

UI perf tests require the chat panel to be visible (Agent Sessions / chat view). Skipped tests are recorded in the JSON report, not counted as failures.
