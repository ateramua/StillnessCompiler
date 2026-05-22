#!/usr/bin/env bash
# AC-01-03: cold open with cached graph — @ mention path build + fuzzy < 400ms P95 before lite scan.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export NODE_OPTIONS="${NODE_OPTIONS:-} --max-old-space-size=8192"

PERF_JS="out/vs/platform/quantumide/common/quantumideAtMentionPerformance.js"
GRAPH_JS="out/vs/platform/quantumide/common/quantumideWorkspaceGraph.js"

if [[ ! -f "$PERF_JS" || ! -f "$GRAPH_JS" ]]; then
  echo "Missing compiled modules — run: npm run gulp -- compile-client" >&2
  exit 1
fi

echo "== QuantumIDE cold-start @ mention fixture (AC-01-03) =="
node <<NODE
const assert = require('assert');
const path = require('path');
const {
  measureQuantumIDEAtMentionColdOpenP95Ms,
  QUANTUMIDE_AT_MENTION_COLD_OPEN_BUDGET_MS,
  QUANTUMIDE_AT_MENTION_COLD_OPEN_PATH_COUNT,
} = require(path.join(process.cwd(), '$PERF_JS'));
const { createEmptyQuantumIDEWorkspaceGraph } = require(path.join(process.cwd(), '$GRAPH_JS'));

const empty = createEmptyQuantumIDEWorkspaceGraph('fixture-ws', [{ name: 'R', uri: 'file:///r' }], 'hydrated from storage (pre-lite-scan)');
const files = Array.from({ length: QUANTUMIDE_AT_MENTION_COLD_OPEN_PATH_COUNT }, (_, i) => ({
  uri: 'file:///r/src/file' + i + '.ts',
  workspaceRelativePath: 'R/src/file' + i + '.ts',
  name: 'file' + i + '.ts',
  extension: '.ts',
}));
const graph = {
  ...empty,
  files,
  status: { ...empty.status, indexed: true, reason: 'hydrated from storage (pre-lite-scan)' },
};

const { p95Ms, pathCount } = measureQuantumIDEAtMentionColdOpenP95Ms(graph, 'file42', 80);
console.log('cold-at-mention-p95-ms', p95Ms.toFixed(3), 'budget-ms', QUANTUMIDE_AT_MENTION_COLD_OPEN_BUDGET_MS);
console.log('cold-at-mention-path-count', pathCount);
assert.ok(pathCount > 0);
assert.ok(p95Ms < QUANTUMIDE_AT_MENTION_COLD_OPEN_BUDGET_MS, 'P95 ' + p95Ms + ' exceeds ' + QUANTUMIDE_AT_MENTION_COLD_OPEN_BUDGET_MS);
console.log('cold-at-mention-fixture-ok');
NODE

echo "== QuantumIDE cold-start @ mention fixture passed =="
