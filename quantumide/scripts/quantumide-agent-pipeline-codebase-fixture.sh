#!/usr/bin/env bash
# AC-03-03: @codebase questions use Full pipeline (qide.agent.pipeline=full).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

CLASSIFIER_JS="out/vs/platform/quantumide/common/quantumideAgentIntentClassifier.js"
PIPELINE_JS="out/vs/platform/quantumide/common/quantumideAgentPipeline.js"
TELEMETRY_JS="out/vs/platform/quantumide/common/quantumideAgentPipelineTelemetry.js"
HOST_TOOLS_JS="out/vs/platform/agentHost/node/openai/openaiHostTools.js"
if [[ ! -f "$CLASSIFIER_JS" || ! -f "$PIPELINE_JS" || ! -f "$TELEMETRY_JS" || ! -f "$HOST_TOOLS_JS" ]]; then
  echo "Missing compiled JS — run: npm run gulp -- compile-client" >&2
  exit 1
fi

echo "== QuantumIDE agent pipeline @codebase fixture (AC-03-03) =="
node <<'NODE'
const assert = require('assert');
const path = require('path');
const {
  resolveQuantumIDEAgentPipelineForTurn,
  chatVariablesHaveQuantumIDECodebaseAttachment,
} = require(path.join(process.cwd(), 'out/vs/platform/quantumide/common/quantumideAgentIntentClassifier.js'));
const {
  filterOpenAIHostToolsForPipeline,
} = require(path.join(process.cwd(), 'out/vs/platform/quantumide/common/quantumideAgentPipeline.js'));
const {
  getOpenAIHostActivityTools,
} = require(path.join(process.cwd(), 'out/vs/platform/agentHost/node/openai/openaiHostTools.js'));
const {
  QuantumIDEAgentPipelineTelemetryKey,
  recordQuantumIDEAgentPipeline,
  getQuantumIDEAgentPipelineTelemetry,
  resetQuantumIDEAgentPipelineTelemetryForTests,
} = require(path.join(process.cwd(), 'out/vs/platform/quantumide/common/quantumideAgentPipelineTelemetry.js'));

resetQuantumIDEAgentPipelineTelemetryForTests();
const prompt = '@codebase where is the workspace indexer?';
const { pipeline } = resolveQuantumIDEAgentPipelineForTurn(prompt, 'lite');
console.log('agent-pipeline', pipeline);
assert.strictEqual(pipeline, 'full');
recordQuantumIDEAgentPipeline(pipeline);
assert.strictEqual(getQuantumIDEAgentPipelineTelemetry()[QuantumIDEAgentPipelineTelemetryKey], 'full');

const attachmentPipeline = resolveQuantumIDEAgentPipelineForTurn('summarize tests', 'lite', undefined, {
  hasCodebaseAttachment: chatVariablesHaveQuantumIDECodebaseAttachment([{ id: 'quantumide.codebase', name: 'codebase' }]),
}).pipeline;
assert.strictEqual(attachmentPipeline, 'full');

const fullTools = filterOpenAIHostToolsForPipeline(getOpenAIHostActivityTools('full'), 'full');
assert.ok(fullTools.some(t => t.function.name === 'search_semantic_workspace'));
console.log('codebase-semantic-tool-available', true);
console.log('agent-pipeline-codebase-fixture-ok');
NODE

echo "== QuantumIDE agent pipeline @codebase fixture passed =="
