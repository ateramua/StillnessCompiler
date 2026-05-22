#!/usr/bin/env bash
# AC-03-04: read-only workspace write tools fail ≤5ms from call.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

READONLY_JS="out/vs/platform/quantumide/common/quantumideWorkspaceReadonly.js"
if [[ ! -f "$READONLY_JS" ]]; then
  echo "Missing $READONLY_JS — run: npm run gulp -- compile-client" >&2
  exit 1
fi

echo "== QuantumIDE workspace readonly write fixture (AC-03-04) =="
node <<'NODE'
const assert = require('assert');
const path = require('path');
const {
  measureQuantumIDEReadonlyWriteRejectCallMs,
  tryRejectQuantumIDEReadonlyWriteTool,
  QUANTUMIDE_WORKSPACE_READONLY_WRITE_FAIL_BUDGET_MS,
  isQuantumIDEAgentWriteHostTool,
  resetQuantumIDEWorkspaceReadonlyTelemetryForTests,
} = require(path.join(process.cwd(), 'out/vs/platform/quantumide/common/quantumideWorkspaceReadonly.js'));

resetQuantumIDEWorkspaceReadonlyTelemetryForTests();
const samples = [];
for (let i = 0; i < 200; i++) {
  samples.push(measureQuantumIDEReadonlyWriteRejectCallMs('apply_workspace_edits', true, { autoApplyEdits: true }));
}
samples.sort((a, b) => a - b);
const p95 = samples[Math.floor(samples.length * 0.95)] ?? 0;
console.log('readonly-write-reject-p95-ms', p95.toFixed(3), 'budget-ms', QUANTUMIDE_WORKSPACE_READONLY_WRITE_FAIL_BUDGET_MS);
assert.ok(p95 < QUANTUMIDE_WORKSPACE_READONLY_WRITE_FAIL_BUDGET_MS);

const proposeReject = tryRejectQuantumIDEReadonlyWriteTool('propose_file_edit', true);
assert.ok(proposeReject && proposeReject.includes('read-only'));
assert.strictEqual(isQuantumIDEAgentWriteHostTool('search_workspace_text'), false);
assert.strictEqual(isQuantumIDEAgentWriteHostTool('apply_workspace_edits'), true);
console.log('workspace-readonly-write-fixture-ok');
NODE

echo "== QuantumIDE workspace readonly write fixture passed =="
