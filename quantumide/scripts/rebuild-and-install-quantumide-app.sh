#!/usr/bin/env bash
# Full clean compile, package macOS arm64 app, install to /Applications, and launch.
#
# Usage (from anywhere):
#   /path/to/quantumide/scripts/rebuild-and-install-quantumide-app.sh
#
# Options:
#   --no-open    Install but do not launch the app
#   --no-clean   Skip deleting out/ and build caches before compile
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

OPEN_APP=1
CLEAN=1
for arg in "$@"; do
	case "$arg" in
		--no-open) OPEN_APP=0 ;;
		--no-clean) CLEAN=0 ;;
		-h|--help)
			echo "Usage: $0 [--no-open] [--no-clean]"
			exit 0
			;;
		*)
			echo "Unknown option: $arg" >&2
			exit 1
			;;
	esac
done

ENSURE_NODE="$ROOT/scripts/ensure-node22.sh"
PRODUCT_JSON="$ROOT/product.json"
PRODUCT_BAK="$ROOT/product.json.quantumide-build.bak"
BUILD_DIR="$ROOT/../VSCode-darwin-arm64"
BUILT_APP="$BUILD_DIR/QuantumIDE.app"
INSTALL_APP="/Applications/QuantumIDE.app"

restore_product_json() {
	if [[ -f "$PRODUCT_BAK" ]]; then
		mv -f "$PRODUCT_BAK" "$PRODUCT_JSON"
	fi
}

strip_builtin_extensions_for_build() {
	cp "$PRODUCT_JSON" "$PRODUCT_BAK"
	python3 - <<'PY'
import json
from pathlib import Path

p = Path("product.json")
data = json.loads(p.read_text())
data["builtInExtensions"] = []
data["webBuiltInExtensions"] = []
p.write_text(json.dumps(data, indent=2) + "\n")
PY
}

trap restore_product_json EXIT

echo "==> Stripping builtInExtensions from product.json for faster local packaging"
strip_builtin_extensions_for_build

if [[ "$CLEAN" -eq 1 ]]; then
	echo "==> Cleaning build outputs"
	rm -rf \
		"$ROOT/out" \
		"$ROOT/out-build" \
		"$ROOT/out-vscode" \
		"$ROOT/out-vscode-min" \
		"$ROOT/.build" \
		"$BUILD_DIR" \
		"$ROOT/node_modules/.cache"
fi

echo "==> Compiling (this takes several minutes)"
"$ENSURE_NODE" npm run compile

echo "==> Packaging vscode-darwin-arm64 (copilot bundle step can take 20–40 min)"
"$ENSURE_NODE" npm run gulp vscode-darwin-arm64

if [[ ! -d "$BUILT_APP" ]]; then
	echo "Expected app not found: $BUILT_APP" >&2
	exit 1
fi

echo "==> Installing to $INSTALL_APP"
rm -rf "$INSTALL_APP"
ditto "$BUILT_APP" "$INSTALL_APP"

if [[ "$OPEN_APP" -eq 1 ]]; then
	echo "==> Launching QuantumIDE"
	env -u ELECTRON_RUN_AS_NODE open "$INSTALL_APP"
fi

echo "Done."
