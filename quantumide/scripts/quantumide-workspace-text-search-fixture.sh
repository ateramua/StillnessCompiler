#!/usr/bin/env bash
# P95 ripgrep text-search budget on a synthetic 10k-file fixture (§11 / M-15).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f out/vs/platform/agentHost/node/quantumideWorkspaceTextSearch.js ]]; then
  echo "Missing out/vs/platform/agentHost/node/quantumideWorkspaceTextSearch.js — run: npm run gulp -- compile-client" >&2
  exit 1
fi

FIXTURE_DIR="$ROOT/.quantumide-fixtures/text-search-10k"
NEEDLE="QUANTUMIDE_FIXTURE_NEEDLE"
MARKER="$FIXTURE_DIR/.ready"

if [[ ! -f "$MARKER" ]]; then
  echo "Building 10k-file text-search fixture at $FIXTURE_DIR ..."
  rm -rf "$FIXTURE_DIR"
  mkdir -p "$FIXTURE_DIR/src"
  for i in $(seq 0 9999); do
    printf '%s\n' "// file $i" "export const token$i = '$NEEDLE';" > "$FIXTURE_DIR/src/file$i.ts"
  done
  touch "$MARKER"
fi

echo "== QuantumIDE workspace text-search fixture (10k paths) =="
node <<NODE
const assert = require('assert');
const path = require('path');
const {
  searchQuantumIDEWorkspaceTextWithRipgrep,
  computeQuantumIDEWorkspaceTextSearchP95Ms,
  QUANTUMIDE_WORKSPACE_TEXT_SEARCH_P95_BUDGET_MS,
} = require(path.join(process.cwd(), 'out/vs/platform/agentHost/node/quantumideWorkspaceTextSearch.js'));

const fixtureDir = '$FIXTURE_DIR';
const needle = '$NEEDLE';

(async () => {
  const samples = [];
  for (let r = 0; r < 20; r++) {
    const result = await searchQuantumIDEWorkspaceTextWithRipgrep(fixtureDir, needle, 25);
    assert.ok(result, 'ripgrep must return results on 10k fixture');
    assert.ok(result.matches.length > 0, 'expected at least one match');
    samples.push(result.durationMs);
  }
  const p95 = computeQuantumIDEWorkspaceTextSearchP95Ms(samples);
  console.log('text-search-fixture-p95-ms', p95.toFixed(2), 'budget-ms', QUANTUMIDE_WORKSPACE_TEXT_SEARCH_P95_BUDGET_MS);
  assert.ok(p95 < QUANTUMIDE_WORKSPACE_TEXT_SEARCH_P95_BUDGET_MS, \`P95 \${p95}ms exceeds \${QUANTUMIDE_WORKSPACE_TEXT_SEARCH_P95_BUDGET_MS}ms\`);
  console.log('text-search-fixture-ok');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
NODE

echo "== QuantumIDE workspace text-search fixture passed =="
