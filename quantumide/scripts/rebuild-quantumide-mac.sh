#!/usr/bin/env bash
# Rebuild QuantumIDE for macOS and install to /Applications.
#
# IMPORTANT:
# - `npm run compile` alone only updates `out/` (dev). The .app comes from `npm run gulp vscode-darwin-arm64`.
# - Use `npm run gulp`, not bare `gulp` (gulp is not on PATH).
# - Clear builtInExtensions during packaging (same as quantumide-user-guide.html) to avoid GitHub download failures.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

./scripts/ensure-node22.sh bash -lc '
  set -e
  echo "==> Preparing product.json (skip marketplace extension downloads)"
  cp product.json product.json.quantumide-build.bak
  restore_product() { mv -f product.json.quantumide-build.bak product.json; }
  trap restore_product EXIT
  python3 - <<'"'"'PY'"'"'
import json
from pathlib import Path
p = Path("product.json")
data = json.loads(p.read_text())
data["builtInExtensions"] = []
data["webBuiltInExtensions"] = []
p.write_text(json.dumps(data, indent="\t") + "\n")
PY

  echo "==> Cleaning build outputs"
  rm -rf out out-build out-vscode out-vscode-min .build ../VSCode-darwin-arm64 node_modules/.cache

  echo "==> Packaging QuantumIDE (esbuild bundle — includes DevTools fixes)"
  npm run gulp -- vscode-darwin-arm64

  restore_product
  trap - EXIT

  APP="../VSCode-darwin-arm64/QuantumIDE.app"
  WB="$APP/Contents/Resources/app/out/vs/code/electron-browser/workbench/workbench.js"
  if [[ ! -d "$APP" ]]; then
    echo "ERROR: Expected $APP after gulp" >&2
    exit 1
  fi
  if ! grep -q "forceEnableDeveloperKeybindings: true" "$WB" 2>/dev/null; then
    echo "ERROR: Packaged workbench.js is missing DevTools bootstrap (forceEnableDeveloperKeybindings: true)." >&2
    echo "       Grep shows:" >&2
    grep -o "forceEnableDeveloperKeybindings:[^,]*" "$WB" >&2 || true
    exit 1
  fi
  echo "OK: packaged workbench.js includes DevTools bootstrap"

  WB_MAIN="$APP/Contents/Resources/app/out/vs/workbench/workbench.desktop.main.js"
  if [[ ! -f "$WB_MAIN" ]]; then
    echo "ERROR: Missing $WB_MAIN" >&2
    exit 1
  fi
  if grep -q "_autoSaveScheduler" "$WB_MAIN" 2>/dev/null; then
    echo "ERROR: Packaged workbench still has workspace-session auto-save (_autoSaveScheduler)." >&2
    echo "       Source was updated but this .app is stale — rerun this script after saving all fixes." >&2
    exit 1
  fi
  if ! grep -q "QUANTUMIDE_WORKSPACE_STATE_PAYLOAD_KEY" "$WB_MAIN" 2>/dev/null; then
    echo "ERROR: Packaged workbench missing QUANTUMIDE_WORKSPACE_STATE_PAYLOAD_KEY (workspace session fix not bundled)." >&2
    exit 1
  fi
  if ! grep -q "editVelocity" "$WB_MAIN" 2>/dev/null; then
    echo "ERROR: Packaged workbench missing editVelocity (agent speed enhancements not bundled)." >&2
    exit 1
  fi
  echo "OK: packaged workbench includes workspace-session fix (no auto-save storm)"

  echo "==> Installing to /Applications/QuantumIDE.app"
  rm -rf "/Applications/QuantumIDE.app"
  ditto "$APP" "/Applications/QuantumIDE.app"
  echo ""
  echo "Done. Launch:"
  echo "  env -u ELECTRON_RUN_AS_NODE open -a QuantumIDE"
  echo "DevTools should open in a detached window shortly after launch (F12 / Cmd+Option+I also work)."
'
