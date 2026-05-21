#!/usr/bin/env bash
# QuantumIDE Agent Velocity — default verify script (compile gate).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if [[ -x "./scripts/ensure-node22.sh" ]]; then
  ./scripts/ensure-node22.sh npm run compile
else
  npm run compile
fi
