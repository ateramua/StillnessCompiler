# QuantumIDE — Agent Activity (Developer Guide)

How to emit **live agent activity** (Cursor-style tool steps) from a new Agent Host provider.

## Protocol actions

Use the existing Agent Host Protocol (AHP) actions — no custom parallel event bus:

| User-visible step | Emit |
|-------------------|------|
| Tool running / done | `SessionToolCallStart` → `SessionToolCallReady` → `SessionToolCallComplete` |
| Answer text | `SessionResponsePart` (markdown) + `SessionDelta` |
| Reasoning / thinking | `SessionResponsePart` (reasoning) + `SessionReasoning` |
| Session list subtitle | `SessionActivityChanged` with `activity: string \| undefined` |
| Turn lifecycle | `SessionTurnStarted`, `SessionTurnComplete`, `SessionTurnCancelled` |

`SessionActivityChanged.activity` uses protocol `URI` as a **string** (`session.toString()`).

## Label mapping

Import shared labels from:

`src/vs/platform/quantumide/common/agentActivityLabels.ts`

- `getAgentActivityLabel(toolName, args, verbosity)` — maps tool names to `{ kind, label, detail }`
- `resolveAgentActivityDisplayName(...)` — used by `stateToProgressAdapter` for Copilot/Claude/OpenAI UI parity

Set `_meta.toolKind` on `SessionToolCallStart` when known (`search`, `read`, `edit`, `terminal`, `subagent`).

## OpenAI provider reference

Implementation: `src/vs/platform/agentHost/node/openai/openAiAgent.ts`

- Multi-step tool loop (`_runAgentTurnLoop`)
- Host tools: `search_workspace_text`, `read_workspace_file` (`openaiHostTools.ts`)
- Streams tool names early → preview `SessionToolCallStart`
- Tracks in-flight tools; cancel emits failed `SessionToolCallComplete`
- Reasoning: `reasoning_content` / `reasoning` SSE deltas → `SessionReasoning`

## Workbench routing

OpenAI uses the **raw progress path** in `AgentHostSessionHandler`:

- `SessionDelta` and tool actions bypass `stateProgressSeen` gating when provider is OpenAI
- `OpenAIRawToolProgressRouter` maps tool actions → `toolInvocation` chat parts
- `SessionReasoning` → `{ kind: 'thinking', value }` progress

Enable/disable: `quantumide.ai.agent.showActivitySteps` (env: `QUANTUMIDE_AGENT_ACTIVITY=0`).

## Debug

**View → Output → QuantumIDE Agent** — step timeline when `quantumide.ai.agent.activityDebugOutput` is enabled (default on).

## Settings synced to agent host

Via `RootConfigChanged` in `agentHostChatContribution.ts`:

- `quantumide.ai.openai.streaming.*`
- `quantumide.ai.agent.maxToolIterations`
- `quantumide.ai.agent.maxActivityStepsPerTurn`
- `quantumide.ai.agent.activityVerbosity`

## Tests

- `openaiActivityLabels.test.ts`, `openaiHostTools.test.ts`
- `openaiRawToolProgress.test.ts`
- `agentHostChatContribution.test.ts` — OpenAI tool + failure paths

See also: [quantumide-live-agent-activity-requirements.md](./quantumide-live-agent-activity-requirements.md)
