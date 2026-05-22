#!/usr/bin/env bash
# AC-01-06: main-thread long-task count during indexing below baseline (§13.6).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ISOLATION_JS="out/vs/platform/quantumide/common/quantumideIndexingMainThreadIsolation.js"
if [[ ! -f "$ISOLATION_JS" ]]; then
  echo "Missing $ISOLATION_JS — run: npm run gulp -- compile-client" >&2
  exit 1
fi

echo "== QuantumIDE indexer worker isolation fixture (AC-01-06) =="
node <<'NODE'
const assert = require('assert');
const path = require('path');
const {
  compareQuantumIDEIndexingMainThreadIsolation,
  isQuantumIDEIndexingIsolationAcceptable,
  QUANTUMIDE_INDEXER_WORKER_SLICE_YIELD_MS,
} = require(path.join(process.cwd(), 'out/vs/platform/quantumide/common/quantumideIndexingMainThreadIsolation.js'));

(async () => {
  const result = await compareQuantumIDEIndexingMainThreadIsolation(200);
  console.log('indexer-slice-yield-ms', QUANTUMIDE_INDEXER_WORKER_SLICE_YIELD_MS);
  console.log('indexer-baseline-long-tasks', result.baselineLongTasks);
  console.log('indexer-isolated-long-tasks', result.isolatedLongTasks);
  console.log('indexer-file-count', result.fileCount);
  assert.ok(isQuantumIDEIndexingIsolationAcceptable(result));
  console.log('indexer-worker-isolation-fixture-ok');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
NODE

echo "== QuantumIDE indexer worker isolation fixture passed =="
