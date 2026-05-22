#!/usr/bin/env bash
# AC-01-05: watcher create → graph visible within 3s debounced (800ms incremental / 3000ms full).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

WATCHER_JS="out/vs/platform/quantumide/common/quantumideWorkspaceGraphWatcher.js"
GRAPH_JS="out/vs/platform/quantumide/common/quantumideWorkspaceGraph.js"
if [[ ! -f "$WATCHER_JS" || ! -f "$GRAPH_JS" ]]; then
  echo "Missing compiled watcher modules — run: npm run gulp -- compile-client" >&2
  exit 1
fi

echo "== QuantumIDE watcher graph visibility fixture (AC-01-05) =="
node <<NODE
const assert = require('assert');
const path = require('path');
const {
  planWorkspaceGraphFileWatcherRefresh,
  patchQuantumIDEWorkspaceGraphFromWatcher,
  graphContainsWorkspacePath,
  computeQuantumIDEWatcherGraphVisibilityMs,
  isQuantumIDEWatcherGraphVisibleWithinBudget,
  QUANTUMIDE_FILE_WATCHER_FULL_REFRESH_DEBOUNCE_MS,
  QUANTUMIDE_FILE_WATCHER_INCREMENTAL_DEBOUNCE_MS,
} = require(path.join(process.cwd(), '$WATCHER_JS'));
const { createEmptyQuantumIDEWorkspaceGraph } = require(path.join(process.cwd(), '$GRAPH_JS'));

const empty = createEmptyQuantumIDEWorkspaceGraph('fixture-ws', [{ name: 'R', uri: 'file:///r' }], 'ok');
const graph = { ...empty, status: { ...empty.status, indexed: true } };

const createPlan = planWorkspaceGraphFileWatcherRefresh({ changeCount: 1, graph });
assert.strictEqual(createPlan.runIncremental, true);
assert.strictEqual(createPlan.runDebouncedFullRefresh, false);
assert.ok(isQuantumIDEWatcherGraphVisibleWithinBudget(createPlan));
assert.strictEqual(computeQuantumIDEWatcherGraphVisibilityMs(createPlan), QUANTUMIDE_FILE_WATCHER_INCREMENTAL_DEBOUNCE_MS);
assert.ok(QUANTUMIDE_FILE_WATCHER_INCREMENTAL_DEBOUNCE_MS <= QUANTUMIDE_FILE_WATCHER_FULL_REFRESH_DEBOUNCE_MS);

const patched = patchQuantumIDEWorkspaceGraphFromWatcher(graph, {
  added: [{
    uri: 'file:///r/src/Created.ts',
    workspaceRelativePath: 'R/src/Created.ts',
    name: 'Created.ts',
    extension: '.ts',
  }],
});
assert.ok(graphContainsWorkspacePath(patched, 'R/src/Created.ts'));

const burstPlan = planWorkspaceGraphFileWatcherRefresh({ changeCount: 200, graph });
assert.strictEqual(computeQuantumIDEWatcherGraphVisibilityMs(burstPlan), QUANTUMIDE_FILE_WATCHER_FULL_REFRESH_DEBOUNCE_MS);

console.log('watcher-create-visible-ms', QUANTUMIDE_FILE_WATCHER_INCREMENTAL_DEBOUNCE_MS);
console.log('watcher-full-debounce-ms', QUANTUMIDE_FILE_WATCHER_FULL_REFRESH_DEBOUNCE_MS);
console.log('watcher-graph-fixture-ok');
NODE

echo "== QuantumIDE watcher graph visibility fixture passed =="
