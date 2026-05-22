#!/usr/bin/env bash
# AC-03-01: fs_simple existence prompts route to Lite pipeline (qide.agent.pipeline=lite).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

CLASSIFIER_JS="out/vs/platform/quantumide/common/quantumideAgentIntentClassifier.js"
TELEMETRY_JS="out/vs/platform/quantumide/common/quantumideAgentPipelineTelemetry.js"
if [[ ! -f "$CLASSIFIER_JS" || ! -f "$TELEMETRY_JS" ]]; then
  echo "Missing classifier/telemetry JS — run: npm run gulp -- compile-client" >&2
  exit 1
fi

echo "== QuantumIDE agent pipeline lite fixture (AC-03-01) =="
node <<'NODE'
const assert = require('assert');
const path = require('path');
const {
  classifyQuantumIDEAgentIntent,
  resolveQuantumIDEAgentPipeline,
} = require(path.join(process.cwd(), 'out/vs/platform/quantumide/common/quantumideAgentIntentClassifier.js'));
const {
  QuantumIDEAgentPipelineTelemetryKey,
  recordQuantumIDEAgentPipeline,
  getQuantumIDEAgentPipelineTelemetry,
  resetQuantumIDEAgentPipelineTelemetryForTests,
} = require(path.join(process.cwd(), 'out/vs/platform/quantumide/common/quantumideAgentPipelineTelemetry.js'));

resetQuantumIDEAgentPipelineTelemetryForTests();
const prompt = 'Does src/main.ts exist?';
const classification = classifyQuantumIDEAgentIntent(prompt);
const pipeline = resolveQuantumIDEAgentPipeline(classification, 'auto');
console.log('agent-intent', classification.intent);
console.log('agent-pipeline', pipeline);
assert.strictEqual(classification.intent, 'fs_simple');
assert.strictEqual(pipeline, 'lite');
recordQuantumIDEAgentPipeline(pipeline);
const telemetry = getQuantumIDEAgentPipelineTelemetry();
console.log('agent-telemetry', telemetry);
assert.strictEqual(telemetry[QuantumIDEAgentPipelineTelemetryKey], 'lite');
console.log('agent-pipeline-lite-fixture-ok');
NODE

echo "== QuantumIDE agent pipeline lite fixture passed =="
