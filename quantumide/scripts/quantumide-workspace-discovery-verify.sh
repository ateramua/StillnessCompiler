#!/usr/bin/env bash
# Validates workspace file-discovery pure modules (compiled out/).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== QuantumIDE workspace discovery verify =="

if [[ ! -f out/vs/platform/quantumide/common/quantumideWorkspaceIgnore.js ]]; then
  echo "Missing compiled out/ — run: npm run gulp -- compile-client" >&2
  exit 1
fi

node <<'NODE'
(async () => {
const assert = require('assert');
const path = require('path');
const root = process.cwd();

function req(rel) {
  return require(path.join(root, 'out', rel));
}

const { mergeQuantumIDEIgnorePolicy, isQuantumIDEPathIgnored } = req('vs/platform/quantumide/common/quantumideWorkspaceIgnore.js');
const { mergeQuantumIDEIndexingExcludePatterns } = req('vs/platform/quantumide/common/quantumideIndexingExcludePatterns.js');
const { isIgnoredByGitignore } = req('vs/platform/quantumide/common/quantumideGitignore.js');
const { parseQuantumIDERuleFrontmatter: parseRules } = req('vs/platform/quantumide/common/quantumideChatRules.js');
const { assertSafeWorkspaceRelativePath } = req('vs/platform/quantumide/common/quantumideWorkspacePathSecurity.js');
const { filterPathsByTargetDirectories } = req('vs/platform/quantumide/common/quantumideSemanticSearchPaths.js');

const policy = mergeQuantumIDEIgnorePolicy(new Set(['node_modules']), 'secrets/**\n', undefined);
assert.ok(isQuantumIDEPathIgnored('secrets/a.txt', policy, 'ai'));
const withGitignore = mergeQuantumIDEIgnorePolicy(new Set(['node_modules']), undefined, 'dist/**\n');
assert.ok(isQuantumIDEPathIgnored('dist/bundle.js', withGitignore, 'index'));
assert.ok(isIgnoredByGitignore('node_modules/x', ['node_modules/']));
const withExclude = mergeQuantumIDEIndexingExcludePatterns(withGitignore, ['customDir', '**/*.min.js']);
assert.ok(withExclude.excludedDirectoryNames.has('customDir'));
assert.ok(isQuantumIDEPathIgnored('lib/foo.min.js', withExclude, 'index'));

assert.throws(() => assertSafeWorkspaceRelativePath('../x'));

const parsed = parseRules('---\nglobs: src/**\n---\n\nBody');
assert.strictEqual(parsed.activation, 'auto');

const filtered = filterPathsByTargetDirectories(['a/x.ts', 'b/y.ts'], ['a/']);
assert.deepStrictEqual(filtered, ['a/x.ts']);

const { recordQuantumIDEWorkspaceGraphRefresh, getQuantumIDEWorkspaceDiscoveryTelemetryCounters } = req('vs/platform/quantumide/common/quantumideWorkspaceDiscoveryTelemetry.js');
recordQuantumIDEWorkspaceGraphRefresh({ durationMs: 12, fileCount: 3, truncated: false, ignoredPathCount: 1 });
assert.ok(getQuantumIDEWorkspaceDiscoveryTelemetryCounters()['workspace.graph.refresh'] >= 1);

const { quantumideFuzzyMatchFilePaths } = req('vs/platform/quantumide/common/quantumideFuzzyFileMatch.js');
let measureQuantumIDEAtMentionFuzzyMatchMs;
let QUANTUMIDE_AT_MENTION_MATCH_BUDGET_MS = 200;
try {
  ({ measureQuantumIDEAtMentionFuzzyMatchMs, QUANTUMIDE_AT_MENTION_MATCH_BUDGET_MS } = req('vs/platform/quantumide/common/quantumideAtMentionPerformance.js'));
} catch {
  measureQuantumIDEAtMentionFuzzyMatchMs = (paths, query, iterations = 30) => {
    quantumideFuzzyMatchFilePaths(query, paths, 20);
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      quantumideFuzzyMatchFilePaths(query, paths, 20);
    }
    return (performance.now() - start) / iterations;
  };
}
const many = Array.from({ length: 6000 }, (_, i) => `root/file${i}.ts`);
const fm = quantumideFuzzyMatchFilePaths('file42', many, 5);
assert.ok(fm.length > 0);
const warm5k = Array.from({ length: 5000 }, (_, i) => `Root${i % 5}/src/file${i}.ts`);
const atMentionAvgMs = measureQuantumIDEAtMentionFuzzyMatchMs(warm5k, 'file4', 30);
assert.ok(atMentionAvgMs < QUANTUMIDE_AT_MENTION_MATCH_BUDGET_MS, `at-mention p95 target ${QUANTUMIDE_AT_MENTION_MATCH_BUDGET_MS}ms, got ${atMentionAvgMs}`);
console.log('at-mention-warm-avg-ms', atMentionAvgMs.toFixed(2));

const { QuantumIDEPerformanceBudgetMs, appendPartialContextFooter } = req('vs/platform/quantumide/common/quantumidePerformanceBudgets.js');
assert.strictEqual(QuantumIDEPerformanceBudgetMs.chatContextBuild, 500);
assert.ok(appendPartialContextFooter('ctx', true).includes('Partial context'));

const {
  computeQuantumIDELiteGraphPerRootBudget,
  computeQuantumIDELiteGraphEffectiveMaxFiles,
  validateQuantumIDELiteGraphListsAllRoots,
  QUANTUMIDE_LITE_GRAPH_MULTI_ROOT_SCHEDULE_MS,
} = req('vs/platform/quantumide/common/quantumideLiteGraphValidation.js');

assert.strictEqual(computeQuantumIDELiteGraphPerRootBudget(5), 24);
assert.strictEqual(computeQuantumIDELiteGraphEffectiveMaxFiles(5), 120);
assert.ok(QUANTUMIDE_LITE_GRAPH_MULTI_ROOT_SCHEDULE_MS <= 10_000);

const fiveRootGraph = {
  version: 1,
  workspaceId: 'acceptance-5-root',
  folders: ['R1','R2','R3','R4','R5'].map((name) => ({ name, uri: `file:///${name}` })),
  projects: [],
  manifests: [],
  files: ['R1','R2','R3','R4','R5'].map((name) => ({
    uri: `file:///${name}/entry.ts`,
    workspaceRelativePath: `${name}/entry.ts`,
    name: 'entry.ts',
    extension: '.ts',
  })),
  status: {
    indexed: true,
    reason: 'lite snapshot',
    perRoot: ['R1','R2','R3','R4','R5'].map((name) => ({ folderName: name, filesIndexed: 1, truncated: false })),
  },
};
const liteErrors = validateQuantumIDELiteGraphListsAllRoots(fiveRootGraph);
assert.strictEqual(liteErrors.length, 0, liteErrors.join('; '));

const {
	QUANTUMIDE_WORKSPACE_UNTRUSTED_REASON,
	validateQuantumIDEUntrustedWorkspaceGraph,
	formatQuantumIDEWorkspaceTrustWarningForContext,
	isQuantumIDEWorkspaceGraphUntrusted,
} = req('vs/platform/quantumide/common/quantumideWorkspaceTrust.js');
const { createEmptyQuantumIDEWorkspaceGraph } = req('vs/platform/quantumide/common/quantumideWorkspaceGraph.js');
const untrustedGraph = createEmptyQuantumIDEWorkspaceGraph('u', [{ name: 'R', uri: 'file:///r' }], QUANTUMIDE_WORKSPACE_UNTRUSTED_REASON);
assert.strictEqual(validateQuantumIDEUntrustedWorkspaceGraph(untrustedGraph).length, 0);
assert.ok(isQuantumIDEWorkspaceGraphUntrusted(untrustedGraph));
const warn = formatQuantumIDEWorkspaceTrustWarningForContext();
assert.ok(warn.includes('not trusted') && warn.includes('full workspace file scan'));

const { resolveQuantumIDEWorkspaceVariablePath } = req('vs/platform/quantumide/common/quantumideWorkspaceRoots.js');
const { toWorkspaceVariableEntry } = req('vs/workbench/contrib/chat/common/attachments/chatVariableEntries.js');
const { URI } = req('vs/base/common/uri.js');
const entry = toWorkspaceVariableEntry('InnerProsperity/foo.ts', 'foo.ts');
assert.strictEqual(entry.kind, 'workspace');
const resolved = resolveQuantumIDEWorkspaceVariablePath(entry.value, [
  { name: 'StillnessCompiler', uri: URI.file('/repos/StillnessCompiler') },
  { name: 'InnerProsperity', uri: URI.file('/repos/InnerProsperity') },
]);
assert.strictEqual(resolved.fsPath, '/repos/InnerProsperity/foo.ts');

const { treeSitterSymbolEntry } = req('vs/platform/quantumide/common/quantumideTreeSitterAst.js');
const { countTreeSitterAstSymbols, buildAstIndex, buildSemanticIndex } = req('vs/platform/quantumide/common/quantumideSemanticIndex.js');
const sym = treeSitterSymbolEntry('Root/a.ts', {
  type: 'identifier',
  text: 'Foo',
  startPosition: { row: 0, column: 0 },
  endPosition: { row: 0, column: 3 },
}, 'class_declaration');
assert.strictEqual(sym.metadata?.parser, 'tree-sitter-wasm');
assert.strictEqual(countTreeSitterAstSymbols([sym]), 1);
const idx = buildAstIndex([{ path: 'Root/a.ts', text: 'class Foo {}' }], () => [sym]);
assert.strictEqual(idx.treeSitterSymbolCount, 1);

const {
  buildSemanticIndexFeedContextSections,
  formatSemanticSearchHitLine,
} = req('vs/platform/quantumide/common/quantumideSemanticIndexFeed.js');
const semantic = buildSemanticIndex([{ path: 'feed/a.ts', text: 'export function feedMe() {}' }]);
const feedSections = buildSemanticIndexFeedContextSections({ semantic, userQuery: 'feed' });
assert.ok(feedSections.some(s => s.id === 'semantic-index'));
const hitLine = formatSemanticSearchHitLine({ path: 'x.ts', score: 2 }, [sym]);
assert.ok(hitLine.includes('x.ts'));

const { getIndexingGateMessage } = req('vs/platform/quantumide/common/quantumideIndexingStatusStore.js');
const gateFiles = new Map();
gateFiles.set('/gate-workspace/.quantumide/indexing-status.json', JSON.stringify({ ready: false, busy: true, indexedFiles: 0, updatedAt: 't' }));
const memFs = {
  readFile: async (uri) => ({ value: { toString: () => gateFiles.get(uri.fsPath) ?? '' } }),
};
const gateMsg = await getIndexingGateMessage(memFs, URI.file('/gate-workspace'), true);
assert.ok(gateMsg && gateMsg.includes('indexing'));

const {
  formatQuantumIDEWorkspaceReadonlyToolError,
  isQuantumIDEWorkspaceFileMutatingHostTool,
} = req('vs/platform/quantumide/common/quantumideWorkspaceReadonly.js');
assert.ok(isQuantumIDEWorkspaceFileMutatingHostTool('apply_workspace_edits'));
assert.ok(!isQuantumIDEWorkspaceFileMutatingHostTool('read_workspace_file'));
assert.ok(formatQuantumIDEWorkspaceReadonlyToolError('apply_workspace_edits').includes('read-only'));

const { rankAndTrimContextSections, formatRankedContext } = req('vs/platform/quantumide/common/quantumideContextRanker.js');
const trim = rankAndTrimContextSections([
  { id: 'workspace', title: '', body: 'a'.repeat(90), priority: 100 },
  { id: 'comments-index', title: 'C', body: 'b'.repeat(90), priority: 45 },
], 100);
assert.ok(trim.omitted.includes('comments-index'));
assert.ok(formatRankedContext(trim.included, trim.omitted).includes('comments-index'));

const {
  planWorkspaceGraphFileWatcherRefresh,
  QUANTUMIDE_FILE_WATCHER_FULL_REFRESH_DEBOUNCE_MS,
} = req('vs/platform/quantumide/common/quantumideWorkspaceGraphWatcher.js');
const indexedGraph = createEmptyQuantumIDEWorkspaceGraph('w', [{ name: 'R', uri: 'file:///r' }], 'indexed');
indexedGraph.status.indexed = true;
const createPlan = planWorkspaceGraphFileWatcherRefresh({ changeCount: 1, graph: indexedGraph });
assert.strictEqual(createPlan.runIncremental, true);
assert.strictEqual(createPlan.runDebouncedFullRefresh, true);
assert.strictEqual(QUANTUMIDE_FILE_WATCHER_FULL_REFRESH_DEBOUNCE_MS, 3000);

const { formatQuantumIDEIndexingSyncLog } = req('vs/platform/quantumide/common/quantumideIndexingSyncLog.js');
const syncLog = formatQuantumIDEIndexingSyncLog({ phase: 'scheduled', reason: 'periodic-sync-5m', percent: 12, indexedFiles: 60 });
assert.ok(syncLog.includes('sync-scheduled') && syncLog.includes('percent=12'));
const vectorDone = formatQuantumIDEIndexingSyncLog({
  phase: 'completed',
  reason: 'open-project-vector-pipeline',
  indexedFiles: 500,
  vectorChunks: 2,
  embeddingProvider: 'local',
});
assert.ok(vectorDone.includes('vectorChunks=2') && vectorDone.includes('embedding=local'));

const {
  QUANTUMIDE_VECTOR_INDEX_PERIODIC_SYNC_MS,
  QUANTUMIDE_VECTOR_INDEX_OPEN_PROJECT_DEFER_MS,
  isQuantumIDEVectorIndexPeriodicSyncReason,
} = req('vs/platform/quantumide/common/quantumideVectorIndexWorkflow.js');
const {
  chunkVectorDocuments,
  vectorIndexFromDocuments,
  serializeVectorStoreChunk,
  parseVectorStoreChunk,
} = req('vs/platform/quantumide/common/quantumideIncrementalVectorStore.js');
assert.strictEqual(QUANTUMIDE_VECTOR_INDEX_PERIODIC_SYNC_MS, 300000);
assert.strictEqual(QUANTUMIDE_VECTOR_INDEX_OPEN_PROJECT_DEFER_MS, 10000);
assert.ok(isQuantumIDEVectorIndexPeriodicSyncReason('periodic-sync-5m'));
const sampleDocs = [{ path: 'a.ts', text: 'export const x = 1;' }, { path: 'b.ts', text: 'export const y = 2;' }];
const vecIndex = vectorIndexFromDocuments(sampleDocs);
const vecChunks = chunkVectorDocuments(vecIndex.documents);
assert.ok(vecChunks.length >= 1);
const restored = parseVectorStoreChunk(serializeVectorStoreChunk(vecChunks[0]), vecIndex.dim);
assert.strictEqual(restored.length, vecChunks[0].length);
console.log('vector-index-workflow-chunks', vecChunks.length);

const fs = require('fs');
const os = require('os');
const {
  searchQuantumIDEWorkspaceTextWithRipgrep,
  computeQuantumIDEWorkspaceTextSearchP95Ms,
  QUANTUMIDE_WORKSPACE_TEXT_SEARCH_SAMPLE_P95_BUDGET_MS,
} = req('vs/platform/agentHost/node/quantumideWorkspaceTextSearch.js');
const sampleDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qide-verify-rg-'));
try {
  fs.mkdirSync(path.join(sampleDir, 'pkg'), { recursive: true });
  for (let i = 0; i < 300; i++) {
    fs.writeFileSync(
      path.join(sampleDir, 'pkg', `f${i}.ts`),
      `export const v${i} = 'QUANTUMIDE_VERIFY_TOKEN';\n`,
    );
  }
  const rgSamples = [];
  for (let r = 0; r < 10; r++) {
    const rg = await searchQuantumIDEWorkspaceTextWithRipgrep(sampleDir, 'QUANTUMIDE_VERIFY_TOKEN', 5);
    assert.ok(rg && rg.matches.length > 0, 'ripgrep sample search');
    rgSamples.push(rg.durationMs);
  }
  const rgP95 = computeQuantumIDEWorkspaceTextSearchP95Ms(rgSamples);
  assert.ok(rgP95 < QUANTUMIDE_WORKSPACE_TEXT_SEARCH_SAMPLE_P95_BUDGET_MS, `text-search sample P95 ${rgP95}ms`);
  console.log('text-search-sample-p95-ms', rgP95.toFixed(2));
} finally {
  fs.rmSync(sampleDir, { recursive: true, force: true });
}

console.log('workspace-discovery-verify-ok');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
NODE

bash scripts/quantumide-workspace-text-search-fixture.sh
bash scripts/quantumide-index-search-fixture.sh

echo "== QuantumIDE workspace discovery verify passed =="
