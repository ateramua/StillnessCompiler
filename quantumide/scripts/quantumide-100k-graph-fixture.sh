#!/usr/bin/env bash
# AC-01-01: structural exists / list_dir from in-memory graph index, 100k paths, P95 < 10ms.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export NODE_OPTIONS="${NODE_OPTIONS:-} --max-old-space-size=8192 --expose-gc"

STRUCT_JS="out/vs/platform/quantumide/common/quantumideWorkspaceGraphStructureIndex.js"
PERF_JS="out/vs/platform/quantumide/common/quantumideWorkspaceStructuralQueryPerformance.js"
MEM_JS="out/vs/platform/quantumide/common/quantumideWorkspace100kMemoryPerformance.js"

if [[ ! -f "$STRUCT_JS" || ! -f "$PERF_JS" || ! -f "$MEM_JS" ]]; then
  echo "Missing compiled structure index modules — run: npm run gulp -- compile-client" >&2
  exit 1
fi

echo "== QuantumIDE 100k structural query fixture (AC-01-01) =="
node <<NODE
const assert = require('assert');
const path = require('path');
const {
  buildQuantumIDEWorkspaceGraphStructureIndex,
} = require(path.join(process.cwd(), '$STRUCT_JS'));
const {
  computeQuantumIDEStructuralQueryP95Ms,
  measureQuantumIDEStructuralQuerySamples,
  QUANTUMIDE_STRUCTURAL_QUERY_P95_BUDGET_MS,
} = require(path.join(process.cwd(), '$PERF_JS'));

const paths = Array.from({ length: 100000 }, (_, i) => 'src/pkg' + (i % 500) + '/module' + i + '.ts');
const buildStart = performance.now();
const index = buildQuantumIDEWorkspaceGraphStructureIndex(paths);
const buildMs = performance.now() - buildStart;
assert.strictEqual(index.fileCount, 100000);

const existsSamples = measureQuantumIDEStructuralQuerySamples(100, () => {
  index.pathExists('src/pkg37/module9001.ts');
  index.pathExists('src/pkg12/module42.ts');
  index.pathExists('missing/nope.ts');
});
const listSamples = measureQuantumIDEStructuralQuerySamples(100, () => {
  index.listImmediateChildren('.');
  index.listImmediateChildren('src/pkg12');
});

const existsP95 = computeQuantumIDEStructuralQueryP95Ms(existsSamples);
const listP95 = computeQuantumIDEStructuralQueryP95Ms(listSamples);
console.log('graph-100k-build-ms', buildMs.toFixed(2));
console.log('graph-100k-exists-p95-ms', existsP95.toFixed(3), 'budget-ms', QUANTUMIDE_STRUCTURAL_QUERY_P95_BUDGET_MS);
console.log('graph-100k-list-p95-ms', listP95.toFixed(3), 'budget-ms', QUANTUMIDE_STRUCTURAL_QUERY_P95_BUDGET_MS);

assert.ok(existsP95 < QUANTUMIDE_STRUCTURAL_QUERY_P95_BUDGET_MS, 'exists P95 ' + existsP95 + ' exceeds budget');
assert.ok(listP95 < QUANTUMIDE_STRUCTURAL_QUERY_P95_BUDGET_MS, 'list_dir P95 ' + listP95 + ' exceeds budget');

const {
  measureQuantumIDE100kWorkspaceCacheMemory,
  QUANTUMIDE_100K_MEMORY_BUDGET_MB,
} = require(path.join(process.cwd(), '$MEM_JS'));
const mem = measureQuantumIDE100kWorkspaceCacheMemory();
assert.ok(mem.withinBudget, 'AC-04-03 memory estimated=' + mem.estimatedMb.toFixed(1) + 'MB heap=' + mem.heapDeltaMb.toFixed(1) + 'MB');
assert.ok(mem.estimatedMb <= QUANTUMIDE_100K_MEMORY_BUDGET_MB);
console.log('graph-100k-memory-estimated-mb', mem.estimatedMb.toFixed(2), 'heap-delta-mb', mem.heapDeltaMb.toFixed(2), 'budget-mb', QUANTUMIDE_100K_MEMORY_BUDGET_MB);

console.log('graph-100k-fixture-ok');
NODE

echo "== QuantumIDE 100k structural query fixture passed =="
