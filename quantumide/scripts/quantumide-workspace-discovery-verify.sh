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

const {
  measureQuantumIDEWarmExistsBatchFromGraphMs,
  QUANTUMIDE_FAST_PATH_EXISTS_WARM_BATCH_BUDGET_MS,
  QUANTUMIDE_FAST_PATH_EXISTS_WARM_BATCH_SIZE,
} = req('vs/platform/quantumide/common/quantumideWorkspaceFastPathPerformance.js');
const warmExists = measureQuantumIDEWarmExistsBatchFromGraphMs();
assert.strictEqual(warmExists.hits, QUANTUMIDE_FAST_PATH_EXISTS_WARM_BATCH_SIZE);
assert.strictEqual(warmExists.misses, 0);
assert.ok(
  warmExists.totalMs <= QUANTUMIDE_FAST_PATH_EXISTS_WARM_BATCH_BUDGET_MS,
  `AC-02-01 warm exists ${warmExists.totalMs.toFixed(2)}ms > ${QUANTUMIDE_FAST_PATH_EXISTS_WARM_BATCH_BUDGET_MS}ms`,
);
console.log('fast-path-warm-exists-ms', warmExists.totalMs.toFixed(2));

const {
  measureQuantumIDEListWorkspaceDirectoryIndexP95Ms,
  QUANTUMIDE_LIST_WORKSPACE_DIRECTORY_P95_BUDGET_MS,
} = req('vs/platform/quantumide/common/quantumideListWorkspaceDirectoryPerformance.js');
const listDirP95 = measureQuantumIDEListWorkspaceDirectoryIndexP95Ms();
assert.ok(
  listDirP95 < QUANTUMIDE_LIST_WORKSPACE_DIRECTORY_P95_BUDGET_MS,
  `AC-02-02 list_workspace_directory P95 ${listDirP95.toFixed(3)}ms > ${QUANTUMIDE_LIST_WORKSPACE_DIRECTORY_P95_BUDGET_MS}ms`,
);
console.log('list-workspace-directory-index-p95-ms', listDirP95.toFixed(3));

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
  computeQuantumIDEMultiRootScanConcurrency,
} = req('vs/platform/quantumide/common/quantumideParallelRootScan.js');
assert.strictEqual(computeQuantumIDEMultiRootScanConcurrency(5), 4);

const {
  measureQuantumIDE5RootParallelLiteScanMs,
  QUANTUMIDE_5_ROOT_LITE_WALL_BUDGET_MS,
} = req('vs/platform/quantumide/common/quantumideLiteGraphParallelPerformance.js');
const lite5Root = await measureQuantumIDE5RootParallelLiteScanMs();
assert.ok(
  lite5Root.wallMs <= QUANTUMIDE_5_ROOT_LITE_WALL_BUDGET_MS,
  `AC-04-02 5-root parallel lite ${lite5Root.wallMs.toFixed(0)}ms > ${QUANTUMIDE_5_ROOT_LITE_WALL_BUDGET_MS}ms`,
);
console.log('parallel-5-root-lite-wall-ms', lite5Root.wallMs.toFixed(0), 'concurrency', lite5Root.concurrency);

const {
  measureQuantumIDE100kWorkspaceCacheMemory,
  QUANTUMIDE_100K_MEMORY_BUDGET_MB,
} = req('vs/platform/quantumide/common/quantumideWorkspace100kMemoryPerformance.js');
const mem100k = measureQuantumIDE100kWorkspaceCacheMemory();
assert.ok(mem100k.withinBudget, `AC-04-03 estimated=${mem100k.estimatedMb.toFixed(1)}MB heap=${mem100k.heapDeltaMb.toFixed(1)}MB`);
assert.ok(mem100k.estimatedMb <= QUANTUMIDE_100K_MEMORY_BUDGET_MB);
console.log('graph-100k-memory-estimated-mb', mem100k.estimatedMb.toFixed(2), 'budget-mb', QUANTUMIDE_100K_MEMORY_BUDGET_MB);

const {
  verifyQuantumIDEWorkspaceTextSearchCacheAvoidsSecondSearch,
} = req('vs/platform/quantumide/common/quantumideWorkspaceTextSearchQueryCachePerformance.js');
const queryCache = await verifyQuantumIDEWorkspaceTextSearchCacheAvoidsSecondSearch();
assert.strictEqual(queryCache.searchCalls, 1);
assert.ok(queryCache.cacheHits >= 1);
console.log('query-cache-hit', queryCache.cacheHits, 'rg-search-calls', queryCache.searchCalls);

const {
  verifyQuantumIDEGraphPatchRefreshConsistency,
} = req('vs/platform/quantumide/common/quantumideWorkspaceGraphRefreshConsistency.js');
const graphRace = verifyQuantumIDEGraphPatchRefreshConsistency();
assert.strictEqual(graphRace.consistent, true);
assert.strictEqual(graphRace.finalFileCount, 20);
assert.strictEqual(graphRace.patchCommitted, false);
console.log('graph-patch-refresh-consistent', graphRace.finalFileCount);

const {
  measureQuantumIDEGraphContextAttachmentReduction,
  QUANTUMIDE_GRAPH_CONTEXT_COMPACT_MIN_REDUCTION,
} = req('vs/platform/quantumide/common/quantumideWorkspaceGraphContextAttachmentPerformance.js');
const graphAttach = measureQuantumIDEGraphContextAttachmentReduction();
assert.ok(graphAttach.meetsAc0305, `AC-03-05 reduction ${(graphAttach.reductionRatio * 100).toFixed(1)}% < ${QUANTUMIDE_GRAPH_CONTEXT_COMPACT_MIN_REDUCTION * 100}%`);
console.log('graph-context-attach-full-bytes', graphAttach.fullBytes, 'compact-bytes', graphAttach.compactBytes, 'reduction-pct', (graphAttach.reductionRatio * 100).toFixed(1));

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
const { VSBuffer } = req('vs/base/common/buffer.js');
const { Schemas } = req('vs/base/common/network.js');
const { FileService } = req('vs/platform/files/common/fileService.js');
const { InMemoryFileSystemProvider } = req('vs/platform/files/common/inMemoryFilesystemProvider.js');
const { NullLogService } = req('vs/platform/log/common/log.js');
const { runQuantumIDEParallelHostReadCoalesceFixture } = req('vs/platform/quantumide/common/quantumideHostAgentRoundFileCache.js');
const { executeOpenAIHostTool } = req('vs/platform/agentHost/node/openai/openaiHostTools.js');
const ac203Log = new NullLogService();
const ac203FileService = new FileService(ac203Log);
const ac203Provider = new InMemoryFileSystemProvider();
ac203FileService.registerProvider(Schemas.file, ac203Provider);
const ac203Root = URI.file('/ac203-workspace');
await ac203FileService.writeFile(URI.joinPath(ac203Root, 'same.ts'), VSBuffer.fromString('export const same = 1;\n'));
const coalesce = await runQuantumIDEParallelHostReadCoalesceFixture(async cache => {
  await executeOpenAIHostTool(ac203FileService, ac203Root, 'read_workspace_file', { path: 'same.ts' }, { agentRoundFileCache: cache });
}, 8);
assert.strictEqual(coalesce.statCalls, 1);
assert.strictEqual(coalesce.readCalls, 1);
assert.strictEqual(coalesce.resolveCalls, 0);
console.log('parallel-host-read-coalesce-stat', coalesce.statCalls, 'read', coalesce.readCalls);

const {
  truncateQuantumIDEHostToolPayload,
  parseQuantumIDEHostToolPayloadMeta,
  utf8ByteLength,
  QUANTUMIDE_HOST_TOOL_PAYLOAD_MAX_BYTES,
} = req('vs/platform/quantumide/common/quantumideHostToolPayload.js');
const oversized = 'z'.repeat(600_000);
const capped = truncateQuantumIDEHostToolPayload(oversized, 'read_workspace_file');
assert.strictEqual(capped.truncated, true);
assert.ok(utf8ByteLength(capped.text) <= QUANTUMIDE_HOST_TOOL_PAYLOAD_MAX_BYTES);
const capMeta = parseQuantumIDEHostToolPayloadMeta(capped.text);
assert.ok(capMeta && capMeta.truncated === true);
console.log('tool-payload-cap-bytes', utf8ByteLength(capped.text), 'original', capMeta.originalBytes);

const {
  recordQuantumIDEFastPathHit,
  recordQuantumIDEFastPathMiss,
  resetQuantumIDEPerfTelemetryForTests,
  QuantumIDEPerfTelemetryCounter,
} = req('vs/platform/quantumide/common/quantumidePerfTelemetry.js');
resetQuantumIDEPerfTelemetryForTests();
recordQuantumIDEFastPathHit(2);
recordQuantumIDEFastPathMiss(1);
const mergedTelemetry = getQuantumIDEWorkspaceDiscoveryTelemetryCounters();
assert.strictEqual(mergedTelemetry[QuantumIDEPerfTelemetryCounter.FastPathHit], 2);
assert.strictEqual(mergedTelemetry[QuantumIDEPerfTelemetryCounter.FastPathMiss], 1);
console.log('perf-telemetry-fast-path', mergedTelemetry[QuantumIDEPerfTelemetryCounter.FastPathHit], mergedTelemetry[QuantumIDEPerfTelemetryCounter.FastPathMiss]);

const {
  measureQuantumIDEGenerationBumpClearL2L5Ms,
  QUANTUMIDE_CACHE_GENERATION_CLEAR_BUDGET_MS,
} = req('vs/platform/quantumide/common/quantumideWorkspaceCacheGenerationPerformance.js');
const genBump = measureQuantumIDEGenerationBumpClearL2L5Ms();
assert.ok(genBump.clearDurationMs <= QUANTUMIDE_CACHE_GENERATION_CLEAR_BUDGET_MS);
assert.strictEqual(genBump.l2After, 0);
assert.strictEqual(genBump.l5After, 0);
console.log('cache-generation-bump-clear-ms', genBump.clearDurationMs.toFixed(2));

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
assert.strictEqual(createPlan.runDebouncedFullRefresh, false);
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
