#!/usr/bin/env bash
# VS Code / QuantumIDE requires Node from .nvmrc and npm < 11.2 (enforced in build/npm/preinstall.ts).
# Usage: ./scripts/ensure-node22.sh npm ci
#        ./scripts/ensure-node22.sh npm run electron
#        ./scripts/ensure-node22.sh ./scripts/code.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
REQ="$(tr -d '\r\n' < .nvmrc)"
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [[ ! -s "$NVM_DIR/nvm.sh" ]]; then
	echo "nvm not found at NVM_DIR=$NVM_DIR (install nvm, or use Node ${REQ} + npm < 11.2 manually)." >&2
	exit 1
fi
# shellcheck disable=SC1090
. "$NVM_DIR/nvm.sh"
nvm install "${REQ}"
nvm use "${REQ}"
echo "Using $(node -v) / $(npm -v)" >&2
# When this script is launched via `npm run ...` from a global npm >=11.2, npm exports
# npm_config_user_agent for child processes. build/lib/electron.ts rejects that UA even if PATH
# now resolves to an older npm from nvm (see assertNpmVersionForElectronDownload). Clear it so
# Node-driven steps match the toolchain we just selected; npm sets its own UA when invoked directly.
unset npm_config_user_agent || true
exec "$@"
