#!/usr/bin/env bash
# AC-01-04: active file semantic incremental CPU core P95 ≤ 500ms.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PERF_JS="out/vs/platform/quantumide/common/quantumideSemanticIncrementalPerformance.js"
if [[ ! -f "$PERF_JS" ]]; then
  echo "Missing $PERF_JS — run: npm run gulp -- compile-client" >&2
  exit 1
fi

echo "== QuantumIDE semantic incremental fixture (AC-01-04) =="
node <<NODE
const assert = require('assert');
const path = require('path');
const {
  measureQuantumIDESemanticIncrementalCoreP95Ms,
  QUANTUMIDE_SEMANTIC_INCREMENTAL_FILE_BUDGET_MS,
} = require(path.join(process.cwd(), '$PERF_JS'));

const { p95Ms, path: filePath } = measureQuantumIDESemanticIncrementalCoreP95Ms(80);
console.log('semantic-incremental-p95-ms', p95Ms.toFixed(3), 'budget-ms', QUANTUMIDE_SEMANTIC_INCREMENTAL_FILE_BUDGET_MS);
console.log('semantic-incremental-path', filePath);
assert.ok(p95Ms < QUANTUMIDE_SEMANTIC_INCREMENTAL_FILE_BUDGET_MS);
console.log('semantic-incremental-fixture-ok');
NODE

echo "== QuantumIDE semantic incremental fixture passed =="
