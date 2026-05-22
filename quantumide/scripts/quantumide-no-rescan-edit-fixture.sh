#!/usr/bin/env bash
# AC-01-02: 50 single-file edits in a session → at most 1 full rescan (initial open).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

EDIT_SESSION_JS="out/vs/platform/quantumide/common/quantumideWorkspaceGraphEditSession.js"
if [[ ! -f "$EDIT_SESSION_JS" ]]; then
  echo "Missing $EDIT_SESSION_JS — run: npm run gulp -- compile-client" >&2
  exit 1
fi

echo "== QuantumIDE no-rescan edit session fixture (AC-01-02) =="
node <<NODE
const assert = require('assert');
const path = require('path');
const {
  planQuantumIDEWorkspaceGraphEditSession,
  isQuantumIDEEditSessionFullRescanAcceptable,
  QUANTUMIDE_EDIT_SESSION_ACCEPTANCE_EDIT_COUNT,
  QUANTUMIDE_EDIT_SESSION_MAX_FULL_RESCAN,
} = require(path.join(process.cwd(), '$EDIT_SESSION_JS'));

const graph = {
  version: 1,
  workspaceId: 'fixture-ws',
  folders: [{ name: 'R', uri: 'file:///r' }],
  projects: [],
  manifests: [],
  files: [{ uri: 'file:///r/a.ts', workspaceRelativePath: 'R/a.ts', name: 'a.ts' }],
  status: { indexed: true, generatedAt: new Date().toISOString(), reason: 'fixture' },
};

const plan = planQuantumIDEWorkspaceGraphEditSession({
  graph,
  editCount: QUANTUMIDE_EDIT_SESSION_ACCEPTANCE_EDIT_COUNT,
  changesPerEdit: 1,
  includeInitialFullRescan: true,
});

console.log('edit-session-edits', plan.editCount);
console.log('edit-session-incremental-schedules', plan.incrementalSchedules);
console.log('edit-session-full-rescan-schedules', plan.fullRescanSchedules);
console.log('edit-session-max-full-rescan', QUANTUMIDE_EDIT_SESSION_MAX_FULL_RESCAN);

assert.strictEqual(plan.incrementalSchedules, QUANTUMIDE_EDIT_SESSION_ACCEPTANCE_EDIT_COUNT);
assert.ok(isQuantumIDEEditSessionFullRescanAcceptable(plan));
assert.ok(plan.fullRescanSchedules <= QUANTUMIDE_EDIT_SESSION_MAX_FULL_RESCAN);
console.log('no-rescan-edit-fixture-ok');
NODE

echo "== QuantumIDE no-rescan edit session fixture passed =="
