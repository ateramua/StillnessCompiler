#!/usr/bin/env bash
# AC-03-02: Lite pipeline — zero search_semantic_workspace index invocations.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PIPELINE_JS="out/vs/platform/quantumide/common/quantumideAgentPipeline.js"
TELEMETRY_JS="out/vs/platform/quantumide/common/quantumideAgentPipelineTelemetry.js"
HOST_TOOLS_JS="out/vs/platform/agentHost/node/openai/openaiHostTools.js"
if [[ ! -f "$PIPELINE_JS" || ! -f "$TELEMETRY_JS" || ! -f "$HOST_TOOLS_JS" ]]; then
  echo "Missing compiled JS — run: npm run gulp -- compile-client" >&2
  exit 1
fi

echo "== QuantumIDE lite semantic skip fixture (AC-03-02) =="
node <<'NODE'
const assert = require('assert');
const path = require('path');
const { URI } = require(path.join(process.cwd(), 'out/vs/base/common/uri.js'));
const { VSBuffer } = require(path.join(process.cwd(), 'out/vs/base/common/buffer.js'));
const { FileService } = require(path.join(process.cwd(), 'out/vs/platform/files/common/fileService.js'));
const { InMemoryFileSystemProvider } = require(path.join(process.cwd(), 'out/vs/platform/files/common/inMemoryFilesystemProvider.js'));
const {
  filterOpenAIHostToolsForPipeline,
  isQuantumIDEHostToolAllowedForPipeline,
} = require(path.join(process.cwd(), 'out/vs/platform/quantumide/common/quantumideAgentPipeline.js'));
const {
  getOpenAIHostActivityTools,
  executeOpenAIHostTool,
} = require(path.join(process.cwd(), 'out/vs/platform/agentHost/node/openai/openaiHostTools.js'));
const {
  resetQuantumIDEAgentPipelineTelemetryForTests,
  getQuantumIDESemanticWorkspaceToolInvocationCount,
  getQuantumIDELitePipelineSemanticToolBlockCount,
} = require(path.join(process.cwd(), 'out/vs/platform/quantumide/common/quantumideAgentPipelineTelemetry.js'));

resetQuantumIDEAgentPipelineTelemetryForTests();
const liteTools = filterOpenAIHostToolsForPipeline(getOpenAIHostActivityTools('lite'), 'lite');
const names = liteTools.map(t => t.function.name);
assert.ok(!names.includes('search_semantic_workspace'));
assert.strictEqual(isQuantumIDEHostToolAllowedForPipeline('search_semantic_workspace', 'lite'), false);

(async () => {
  const fileService = new FileService();
  const provider = new InMemoryFileSystemProvider();
  fileService.registerProvider('file', provider);
  const root = URI.file('/workspace');
  await fileService.writeFile(URI.joinPath(root, 'a.ts'), VSBuffer.fromString('export const x = 1;\n'));
  const blocked = await executeOpenAIHostTool(fileService, root, 'search_semantic_workspace', { query: 'x' }, { agentPipeline: 'lite', indexingEnabled: true });
  assert.ok(blocked.includes('Lite agent pipeline'));
  assert.strictEqual(getQuantumIDESemanticWorkspaceToolInvocationCount(), 0);
  assert.strictEqual(getQuantumIDELitePipelineSemanticToolBlockCount(), 1);
  console.log('lite-semantic-tool-blocked', blocked.split('\n')[0]);
  console.log('lite-semantic-invocation-count', getQuantumIDESemanticWorkspaceToolInvocationCount());
  console.log('agent-pipeline-lite-semantic-fixture-ok');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
NODE

echo "== QuantumIDE lite semantic skip fixture passed =="
