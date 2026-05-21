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

  echo "==> Installing to /Applications/QuantumIDE.app"
  rm -rf "/Applications/QuantumIDE.app"
  ditto "$APP" "/Applications/QuantumIDE.app"
  echo ""
  echo "Done. Launch:"
  echo "  env -u ELECTRON_RUN_AS_NODE open -a QuantumIDE"
  echo "DevTools should open in a detached window shortly after launch (F12 / Cmd+Option+I also work)."
'
