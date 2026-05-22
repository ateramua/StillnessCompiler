#!/usr/bin/env bash
# Near-instant agent acceptance harness (requirements 1–12).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f out/vs/platform/quantumide/common/quantumideAgentFastLane.js ]]; then
  echo "Missing compiled out/ — run: npm run gulp -- compile-client" >&2
  exit 1
fi

echo "== QuantumIDE agent near-instant fixture =="
node <<'NODE'
const assert = require('assert');
const path = require('path');
const {
  tryQuantumIDEAgentFsSimpleFastLane,
} = require(path.join(process.cwd(), 'out/vs/platform/quantumide/common/quantumideAgentFastLane.js'));
const {
  buildQuantumIDEWorkspaceAgentSnapshot,
} = require(path.join(process.cwd(), 'out/vs/platform/quantumide/common/quantumideWorkspaceSnapshotBridge.js'));
const {
  runQuantumIDEAgentNearInstantBenchmarks,
  QUANTUMIDE_AGENT_NEAR_INSTANT_BUDGETS,
} = require(path.join(process.cwd(), 'out/vs/platform/quantumide/common/quantumideAgentNearInstantBenchmarks.js'));
const {
  profileForQuantumIDEAgentResponseMode,
} = require(path.join(process.cwd(), 'out/vs/platform/quantumide/common/quantumideAgentResponseMode.js'));
const {
  partitionQuantumIDEAgentToolCalls,
} = require(path.join(process.cwd(), 'out/vs/platform/quantumide/common/quantumideAgentToolBatch.js'));

const graph = {
  version: 1,
  workspaceId: 'fixture',
  folders: [{ name: 'Root', uri: 'file:///Root' }],
  projects: [],
  manifests: [],
  files: Array.from({ length: 100 }, (_, i) => ({
    uri: `file:///Root/f${i}.ts`,
    workspaceRelativePath: `Root/f${i}.ts`,
    name: `f${i}.ts`,
    extension: '.ts',
  })),
  status: { indexed: true, reason: 'fixture' },
};
const snapshot = buildQuantumIDEWorkspaceAgentSnapshot(graph, 1);
const lane = tryQuantumIDEAgentFsSimpleFastLane('Does Root/f42.ts exist?', snapshot);
assert.strictEqual(lane.handled, true);
assert.ok(lane.durationMs < QUANTUMIDE_AGENT_NEAR_INSTANT_BUDGETS.fastLaneMs);

const bench = runQuantumIDEAgentNearInstantBenchmarks();
assert.ok(bench.meetsFastLane && bench.meetsWarmSimple, JSON.stringify(bench));

const parts = partitionQuantumIDEAgentToolCalls([
  { id: 'a', name: 'read_workspace_file', args: {} },
  { id: 'b', name: 'apply_workspace_edits', args: {} },
]);
assert.strictEqual(parts.parallel.length, 1);

const fast = profileForQuantumIDEAgentResponseMode('fast', 'lite');
assert.strictEqual(fast.allowFastLane, true);

console.log('agent-near-instant-fast-lane-ms', lane.durationMs.toFixed(2));
console.log('agent-near-instant-bench', bench);
console.log('agent-near-instant-fixture-ok');
NODE

echo "== QuantumIDE agent near-instant fixture passed =="
