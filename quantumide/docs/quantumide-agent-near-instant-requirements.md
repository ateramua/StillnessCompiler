# QuantumIDE Agent: Near-Instant Response Requirements

**Version:** 1.0  
**Date:** 2026-05-22  
**Status:** Implemented  

Normative implementation targets for Cursor-class agent responsiveness.

## Summary checklist

| # | Requirement | Status | Primary modules |
|---|-------------|--------|-----------------|
| 1 | Persistent incremental workspace indexing | [x] | `quantumideWorkspaceContextService`, `quantumideSemanticIndexService`, `quantumideSymbolShardStore` |
| 2 | Aggressive in-memory caching | [x] | `quantumideWorkspaceFastPath`, `quantumideCachePrewarm`, host round cache |
| 3 | Batch and parallel tool execution | [x] | `openAiAgent._executeToolCalls`, `quantumideAgentToolBatch` |
| 4 | Smarter context management | [x] | `quantumideAgentContextTracker`, graph compact attach |
| 5 | Fast path for simple queries | [x] | `quantumideAgentFastLane`, `AgentFastLaneEnabled` |
| 6 | Adaptive planning depth | [x] | `quantumideAgentResponseMode`, pipeline + max iterations |
| 7 | Lightweight in-process tooling | [x] | `quantumideWorkspaceSnapshotBridge`, in-host fast path |
| 8 | Real-time progress / partial streaming | [x] | `openAiAgent` deltas, `onToolProgress`, `quantumidePerfHistogram` |
| 9 | User-configurable agent modes | [x] | `AgentResponseMode`, `AgentPipelineMode`, velocity settings |
| 10 | Persistent agent state | [x] | `quantumideAgentSessionStateStore`, OpenAI session persist |
| 11 | Optimized toolchain protocols | [x] | `quantumideRipgrepPool`, payload caps, snapshot JSON |
| 12 | Automated performance benchmarks | [x] | `quantumideAgentNearInstantBenchmarks`, fixture script |

## Acceptance criteria

| Criterion | Target | Verification |
|-----------|--------|--------------|
| Cold start simple | &lt;2s | Fast lane + snapshot load |
| Warm simple | &lt;500ms | `quantumideAgentNearInstantBenchmarks`, fast-path exists |
| Progress visible | &lt;100ms | Activity labels + perf marks |
| Mode switch | &lt;200ms | Settings `quantumide.ai.agent.responseMode` |
| No redundant work | — | Context tracker + compact graph attach |
| Persistent state | — | `.quantumide/agent-session-state.v1.json` |

## Verification

```bash
cd quantumide
npm run compile-check-ts-native
npm run gulp -- compile-client
./scripts/quantumide-agent-near-instant-fixture.sh
./scripts/quantumide-performance-parity-verify.sh
```

## Settings

| Setting | Values | Default |
|---------|--------|---------|
| `quantumide.ai.agent.responseMode` | auto, fast, safe | auto |
| `quantumide.ai.agent.fastLane.enabled` | boolean | true |
| `quantumide.ai.agent.pipelineMode` | auto, lite, full | auto |
