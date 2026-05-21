#!/usr/bin/env bash
# Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
# Phase 3 verification: compile check + transpile + parity program unit tests.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== Phase 3: TypeScript compile check =="
./scripts/ensure-node22.sh npm run compile-check-ts-native
echo "Compile check OK."

echo "== Phase 3: Transpile (required for mocha out/*.js tests) =="
./scripts/ensure-node22.sh npm run transpile-client
echo "Transpile OK."

PARITY_GLOB='**/vs/platform/quantumide/test/common/{quantumideCollabPresenceUtils,quantumideInlineSuggestionState,quantumideIdeSettingPolicy,quantumideCursorParityProgramPhase3,quantumideDiffHunks,quantumideCommandPolicy,agentActivityProgress}.test.js'

echo "== Phase 3: Run parity program unit tests =="
./scripts/ensure-node22.sh node test/unit/node/index.js --runGlob "$PARITY_GLOB"
echo "quantumide-cursor-parity-program-verify: all Phase 3 checks passed"
