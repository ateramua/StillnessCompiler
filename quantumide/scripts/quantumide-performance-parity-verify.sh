#!/usr/bin/env bash
# Aggregates performance-parity acceptance fixtures (§12.4 / §14).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export NODE_OPTIONS="${NODE_OPTIONS:-} --max-old-space-size=8192"

SCRIPT_DIR="$(dirname "$0")"
run_fixture() {
  local name="$1"
  echo ""
  echo "== Parity fixture: ${name} =="
  bash "${SCRIPT_DIR}/${name}"
}

require_compiled() {
  local rel="$1"
  if [[ ! -f "${ROOT}/${rel}" ]]; then
    echo "Missing compiled ${rel} — run: npm run gulp -- compile-client" >&2
    exit 1
  fi
}

echo "== QuantumIDE performance parity verify =="

echo "== TypeScript compile check =="
./scripts/ensure-node22.sh npm run compile-check-ts-native

require_compiled out/vs/platform/quantumide/common/quantumideWorkspaceGraphContextAttachment.js
require_compiled out/vs/platform/quantumide/common/quantumideAgentIntentClassifier.js
require_compiled out/vs/platform/quantumide/common/quantumideIndexingMainThreadIsolation.js

run_fixture quantumide-performance-ci.sh
run_fixture quantumide-workspace-discovery-verify.sh
run_fixture quantumide-100k-graph-fixture.sh
run_fixture quantumide-no-rescan-edit-fixture.sh
run_fixture quantumide-cold-start-at-mention-fixture.sh
run_fixture quantumide-semantic-incremental-fixture.sh
run_fixture quantumide-watcher-graph-fixture.sh
run_fixture quantumide-indexer-worker-isolation-fixture.sh
run_fixture quantumide-agent-pipeline-lite-fixture.sh
run_fixture quantumide-agent-pipeline-lite-semantic-fixture.sh
run_fixture quantumide-agent-pipeline-codebase-fixture.sh
run_fixture quantumide-workspace-readonly-write-fixture.sh
run_fixture quantumide-agent-near-instant-fixture.sh

echo ""
echo "== QuantumIDE performance parity verify passed =="
