# Agent Task Phase Status (Editor UI)

Real-time, persistent status messages in the **status bar** (outside chat) matching Cursor Chat panel task phases.

## Requirements coverage

| Req | Implementation |
|-----|----------------|
| 1. Status message types | Phases: reading, planning, analyzing, searching, modifying, verifying, idle, ready, done, error |
| 2. Display location | `IStatusbarService` entry `quantumide.agentTaskPhase` (left alignment) |
| 3. Real-time updates | `IAgentHostService.onDidAction` bridge + 50ms debounce coalescing |
| 4. Dismissal / completion | Auto-clear after `quantumide.ai.agent.taskPhaseStatus.dismissMs` (default 3s) on done/error |
| 5. User feedback | Click → `quantumide.agent.showTaskPhaseDetails` (output channel + open agent welcome) |
| 6. Accessibility | `ariaLabel`, `role: status`, `kind: error` for failures, spinner via `showProgress` |

## Architecture

```
Agent host actions → quantumideAgentTaskPhaseBridge.contribution
                  → IQuantumIDEAgentTaskPhaseStatusService (debounce + priority)
                  → quantumideAgentTaskPhaseStatus.contribution (status bar)
```

Also wired: `IQuantumIDEAgentTaskOrchestratorService`, `IQuantumIDEExecutionGraphService`, `IChatService.requestInProgressObs`.

## Settings

| Setting | Default |
|---------|---------|
| `quantumide.ai.agent.taskPhaseStatus.enabled` | `true` |
| `quantumide.ai.agent.taskPhaseStatus.dismissMs` | `3000` |
| `quantumide.ai.agent.taskPhaseStatus.location` | `statusBar` (`hidden` to disable UI only) |

## Honest limits

- Single visible message (priority queue, not a stacked list for parallel tools).
- Rapid transitions coalesced to 50ms minimum spacing (reduces flicker; may skip sub-200ms flashes).
- Full OT/collab-style multi-task UI not included.

## Key files

- `quantumideAgentTaskPhase.ts` — phase mapping and labels
- `quantumideAgentTaskPhaseStatusService.ts`
- `quantumideAgentTaskPhaseBridge.contribution.ts`
- `quantumideAgentTaskPhaseStatus.contribution.ts`
