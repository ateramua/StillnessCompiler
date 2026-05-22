/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { spawn } from 'child_process';
import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import type { IFileService } from '../../../files/common/files.js';
import {
	isReadOnlyOpenAIHostTool,
	QUANTUMIDE_WORKSPACE_LINKS_FILE,
	type QuantumIDEAgentVelocityProfile,
} from '../../../quantumide/common/agentVelocity.js';
import { parseWorkspaceLinksJson, type IQuantumIDEWorkspaceLink } from '../../../quantumide/common/workspaceLinks.js';
import {
	collectAgentSearchRoots,
	formatWorkspaceRootsForAgent,
	relativePathInWorkspaceRoots,
	resolvePathAcrossWorkspaceRoots,
} from '../../../quantumide/common/quantumideWorkspaceRoots.js';
import { quantumideFuzzyMatchFilePaths } from '../../../quantumide/common/quantumideFuzzyFileMatch.js';
import {
	isQuantumIDEPathIgnored,
	QUANTUMIDE_IGNORE_FILE,
	type IQuantumIDEWorkspaceIgnorePolicy,
} from '../../../quantumide/common/quantumideWorkspaceIgnore.js';
import { loadQuantumIDEWorkspaceIgnorePolicy } from '../../../quantumide/common/quantumideWorkspaceIgnoreLoader.js';
import { formatQuantumIDEWorkspaceDiscoveryLog } from '../../../quantumide/common/quantumideWorkspaceDiscoveryLog.js';
import { searchQuantumIDEWorkspaceTextWithRipgrep } from '../quantumideWorkspaceTextSearch.js';
import {
	assertQuantumIDEWorkspaceWritableForTool,
	isQuantumIDEWorkspaceFileMutatingHostTool,
} from '../../../quantumide/common/quantumideWorkspaceReadonly.js';
import { recordQuantumIDESemanticSearchLatency } from '../../../quantumide/common/quantumideWorkspaceDiscoveryTelemetry.js';
import {
	applyQuantumIDEWorkspaceEdits,
	formatApplyWorkspaceEditsResult,
	parseWorkspaceEditsArg,
} from '../../../quantumide/common/quantumideWorkspaceEdits.js';
import { detectEditConflicts, suggestDependentPaths } from '../../../quantumide/common/quantumideEditEngine.js';
import { buildTypeHierarchy, formatTypeHierarchy } from '../../../quantumide/common/quantumideTypeHierarchy.js';
import { searchArchitecturalPatterns, type QuantumIDEArchitecturePattern } from '../../../quantumide/common/quantumidePatternRetrieval.js';
import {
	executeQuantumIDEPluginHostTool,
	getQuantumIDEPluginHostToolDefinitions,
	getQuantumIDEPlugins,
	isQuantumIDEPluginHostTool,
} from '../../../quantumide/common/quantumidePluginRegistry.js';
import { decryptQuantumIDEIndexPayload, isEncryptedQuantumIDEIndexPayload } from '../../../quantumide/common/quantumideCacheEncryption.js';
import { shouldQuantumIDEBlockExternalIndexing } from '../../../quantumide/common/quantumideSecurity.js';
import { isQuantumIDERefactorHostTool } from '../../../quantumide/common/quantumideRefactorHostTools.js';
import { markQuantumIDEPerformanceEnd, markQuantumIDEPerformanceStart, QuantumIDEPerformanceMark } from '../../../quantumide/common/quantumidePerformanceMarks.js';
import { runWithBudget, QuantumIDEPerformanceBudgetMs } from '../../../quantumide/common/quantumidePerformanceBudgets.js';
import type { IQuantumIDEWorkspacePolicies } from '../../../quantumide/common/quantumideWorkspacePolicies.js';
import {
	findSymbolReferences,
	resolveImportDependencies,
	searchWorkspaceSymbols,
} from '../../../quantumide/common/quantumideRepositoryRetrieval.js';
import {
	QUANTUMIDE_AST_INDEX_FILE,
	QUANTUMIDE_DEPENDENCY_GRAPH_FILE,
	QUANTUMIDE_SEMANTIC_INDEX_FILE,
	QUANTUMIDE_SYMBOL_INDEX_FILE,
	QUANTUMIDE_VECTOR_INDEX_FILE,
	parseSemanticIndexJson,
	searchSemanticIndex,
	type IQuantumIDEAstSymbolEntry,
} from '../../../quantumide/common/quantumideSemanticIndex.js';
import {
	formatSemanticSearchHitLine,
	loadQuantumIDEPersistedSemanticIndexes,
} from '../../../quantumide/common/quantumideSemanticIndexFeed.js';
import { formatQuantumIDEIndexingOffToolFallback } from '../../../quantumide/common/quantumideLiteSnapshotContext.js';
import { filterPathsByTargetDirectories } from '../../../quantumide/common/quantumideSemanticSearchPaths.js';
import { readQuantumIDEIndexingStatus } from '../../../quantumide/common/quantumideIndexingStatusStore.js';
import {
	QUANTUMIDE_COMMENTS_INDEX_FILE,
	QUANTUMIDE_DIAGNOSTICS_INDEX_FILE,
	parseCommentsIndexJson,
	parseDiagnosticsIndexJson,
	searchCommentsIndex,
	searchDiagnosticsIndex,
} from '../../../quantumide/common/quantumideIndexAugment.js';
import { loadIncrementalVectorSearch } from '../../../quantumide/common/quantumideIncrementalVectorStore.js';
import { formatDependencyGraphSummary, type IQuantumIDEDependencyGraph } from '../../../quantumide/common/quantumideDependencyGraph.js';
import {
	extractComponentInFile,
	extractMethodInFile,
	generateTestScaffold,
	migrateApiInFile,
	migrateFrameworkImports,
	moveModuleContent,
	normalizeImportsInFile,
	renameSymbolInFile,
	rewriteImportsInFile,
	updatePackageDependency,
} from '../../../quantumide/common/quantumideRefactorOperations.js';
import { parseVectorIndexJson, searchVectorIndex } from '../../../quantumide/common/quantumideVectorEmbeddings.js';
import { applyUnifiedPatchToFile, restoreEditCheckpoint } from '../../../quantumide/common/quantumideWorkspacePatches.js';
import {
	detectQuantumIDEManifestKind,
	QuantumIDEManifestNames,
	QuantumIDEWorkspaceIndexExcludeNames,
} from '../../../quantumide/common/quantumideWorkspaceGraph.js';
import {
	formatProjectManifestSummaries,
	parseProjectManifestSummary,
} from '../../../quantumide/common/quantumideProjectManifest.js';
import {
	discoverTestsFromWorkspaceFiles,
	formatDiscoveredTests,
} from '../../../quantumide/common/quantumideTestDiscovery.js';
import type { IOpenAIToolDefinition } from './openAiClient.js';
import { executeQuantumIDEHostWorkflowTool, QUANTUMIDE_HOST_WORKFLOW_TOOLS } from './quantumideHostWorkflowTools.js';
import { appendDeferredVerification } from '../../../quantumide/common/quantumideDeferredVerificationStore.js';
import { getIndexingGateMessage } from '../../../quantumide/common/quantumideIndexingStatusStore.js';
import {
	formatBatchApplySummary,
	isDocumentationPath,
	resolveApplyWorkspaceEditsOptions,
	resolveEffectiveEditVelocity,
	shouldPreferDirectEditorEdit,
	type QuantumIDEAgentEditVelocity,
	type QuantumIDEAgentVerifyOnEdit,
} from '../../../quantumide/common/quantumideWorkflowOptimization.js';

export interface IOpenAIHostToolContext {
	readonly crossRootSearch?: boolean;
	/** Synced from VS Code workspace folders via `.quantumide/workspace-links.json`. */
	readonly workspaceLinks?: readonly IQuantumIDEWorkspaceLink[];
	readonly velocityProfile?: QuantumIDEAgentVelocityProfile;
	readonly autoApplyEdits?: boolean;
	readonly requireDeleteConfirmation?: boolean;
	readonly maxEditScope?: number;
	readonly workspacePolicies?: IQuantumIDEWorkspacePolicies;
	readonly privacyLocalIndexingOnly?: boolean;
	readonly fastApplyEdits?: boolean;
	readonly editVelocity?: import('../../../quantumide/common/quantumideWorkflowOptimization.js').QuantumIDEAgentEditVelocity;
	readonly waitForIndexingBeforeEdits?: boolean;
	/** Unified ignore file name from `quantumide.ai.ignoreFile` (SEC-06). */
	readonly ignoreFile?: string;
	readonly preferDirectEditorEdits?: boolean;
	readonly directEditorMaxLines?: number;
	readonly preferLspRename?: boolean;
	readonly verifyOnEdit?: QuantumIDEAgentVerifyOnEdit;
	/** When false, index-backed search tools fall back to text/path discovery (§11). */
	readonly indexingEnabled?: boolean;
	readonly semanticIndexingEnabled?: boolean;
	/** SEC-05: VS Code / provider read-only workspace — discovery reads OK, file writes blocked. */
	readonly workspaceReadonly?: boolean;
}

export const OPENAI_HOST_ACTIVITY_TOOLS: readonly IOpenAIToolDefinition[] = [
	{
		type: 'function',
		function: {
			name: 'search_workspace_text',
			description: 'Search for a text query across text files in the workspace. Returns matching file paths and short excerpts.',
			parameters: {
				type: 'object',
				properties: {
					query: { type: 'string', description: 'Text or regex pattern to search for.' },
					maxResults: { type: 'number', description: 'Maximum number of matches to return (default 20).' },
				},
				required: ['query'],
				additionalProperties: false,
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'search_workspace_text_batch',
			description: 'Run multiple workspace text searches in parallel. Prefer this over serial search_workspace_text calls.',
			parameters: {
				type: 'object',
				properties: {
					queries: {
						type: 'array',
						items: { type: 'string' },
						description: 'Search terms to run in parallel.',
					},
					maxResultsPerQuery: { type: 'number', description: 'Maximum matches per query (default 12).' },
				},
				required: ['queries'],
				additionalProperties: false,
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'read_workspace_file',
			description: 'Read the contents of a workspace file by relative or absolute path.',
			parameters: {
				type: 'object',
				properties: {
					path: { type: 'string', description: 'Workspace-relative or absolute file path.' },
					startLine: { type: 'number', description: 'Optional 1-based start line (inclusive).' },
					endLine: { type: 'number', description: 'Optional 1-based end line (inclusive).' },
					maxChars: { type: 'number', description: 'Maximum characters to return (default 12000).' },
				},
				required: ['path'],
				additionalProperties: false,
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'list_workspace_directory',
			description: 'List files and subdirectories in a workspace directory (relative path). Use before targeted reads on unfamiliar layouts.',
			parameters: {
				type: 'object',
				properties: {
					path: { type: 'string', description: 'Workspace-relative directory path (default ".").' },
					maxEntries: { type: 'number', description: 'Maximum entries to return (default 80).' },
				},
				additionalProperties: false,
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'file_search',
			description: 'Cursor parity alias: fuzzy search workspace file paths by filename or path fragment (same as search_workspace_files).',
			parameters: {
				type: 'object',
				properties: {
					query: { type: 'string', description: 'Partial file name or path to match.' },
					maxResults: { type: 'number', description: 'Maximum paths to return (default 10).' },
				},
				required: ['query'],
				additionalProperties: false,
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'search_workspace_files',
			description: 'Fuzzy search workspace file paths by filename or path fragment. Returns up to 10 matching relative paths.',
			parameters: {
				type: 'object',
				properties: {
					query: { type: 'string', description: 'Partial file name or path to match.' },
					maxResults: { type: 'number', description: 'Maximum paths to return (default 10).' },
				},
				required: ['query'],
				additionalProperties: false,
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'list_workspace_symbols',
			description: 'List top-level symbols (functions, classes, interfaces, types, exported constants) in a workspace file with line numbers.',
			parameters: {
				type: 'object',
				properties: {
					path: { type: 'string', description: 'Workspace-relative or absolute file path.' },
					maxResults: { type: 'number', description: 'Maximum symbols to return (default 40).' },
				},
				required: ['path'],
				additionalProperties: false,
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'search_workspace_symbols',
			description: 'Search for symbol names (functions, classes, types) across the workspace.',
			parameters: {
				type: 'object',
				properties: {
					query: { type: 'string', description: 'Symbol name or substring to find.' },
					maxResults: { type: 'number', description: 'Maximum results (default 40).' },
				},
				required: ['query'],
				additionalProperties: false,
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'find_symbol_references',
			description: 'Find textual references to a symbol name across workspace source files.',
			parameters: {
				type: 'object',
				properties: {
					symbol: { type: 'string', description: 'Symbol name to locate.' },
					maxResults: { type: 'number', description: 'Maximum references (default 30).' },
				},
				required: ['symbol'],
				additionalProperties: false,
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'resolve_import_dependencies',
			description: 'List import/require dependencies declared in a source file.',
			parameters: {
				type: 'object',
				properties: {
					path: { type: 'string', description: 'Workspace-relative or absolute file path.' },
				},
				required: ['path'],
				additionalProperties: false,
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'search_vector_workspace',
			description: 'Vector embedding search over the indexed workspace (local hashed embeddings).',
			parameters: {
				type: 'object',
				properties: {
					query: { type: 'string', description: 'Natural language or keyword query.' },
					maxResults: { type: 'number', description: 'Maximum results (default 15).' },
				},
				required: ['query'],
				additionalProperties: false,
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'query_dependency_graph',
			description: 'Summarize package/file dependency relationships from the workspace dependency graph index.',
			parameters: {
				type: 'object',
				properties: {
					node: { type: 'string', description: 'Optional node label or path filter.' },
					maxNodes: { type: 'number', description: 'Maximum nodes in summary (default 30).' },
				},
				additionalProperties: false,
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'find_implementations',
			description: 'Find likely implementations or definitions for a symbol name across the workspace.',
			parameters: {
				type: 'object',
				properties: {
					symbol: { type: 'string', description: 'Symbol name.' },
					maxResults: { type: 'number', description: 'Maximum results (default 25).' },
				},
				required: ['symbol'],
				additionalProperties: false,
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'normalize_imports',
			description: 'Sort and normalize import statements in a source file.',
			parameters: {
				type: 'object',
				properties: {
					path: { type: 'string', description: 'Workspace-relative file path.' },
				},
				required: ['path'],
				additionalProperties: false,
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'rename_symbol',
			description: 'Rename a symbol in a single file via text match. Set workspaceWide=true to require LSP rename via the client `rename` tool instead.',
			parameters: {
				type: 'object',
				properties: {
					path: { type: 'string' },
					oldName: { type: 'string' },
					newName: { type: 'string' },
					workspaceWide: { type: 'boolean', description: 'When true, defer to workspace LSP rename (client rename tool).' },
				},
				required: ['path', 'oldName', 'newName'],
				additionalProperties: false,
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'rewrite_imports',
			description: 'Rewrite import specifiers in a file (package rename / path migration).',
			parameters: {
				type: 'object',
				properties: {
					path: { type: 'string', description: 'Workspace-relative file path.' },
					fromSpecifier: { type: 'string', description: 'Import path to replace.' },
					toSpecifier: { type: 'string', description: 'Replacement import path.' },
				},
				required: ['path', 'fromSpecifier', 'toSpecifier'],
				additionalProperties: false,
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'extract_method',
			description: 'Extract a line range into a new function and replace with a call.',
			parameters: {
				type: 'object',
				properties: {
					path: { type: 'string', description: 'Workspace-relative file path.' },
					startLine: { type: 'number', description: '1-based start line.' },
					endLine: { type: 'number', description: '1-based end line.' },
					methodName: { type: 'string', description: 'Name for the extracted function.' },
				},
				required: ['path', 'startLine', 'endLine', 'methodName'],
				additionalProperties: false,
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'search_workspace_comments',
			description: 'Search indexed source comments (line and block comments) across the workspace.',
			parameters: {
				type: 'object',
				properties: {
					query: { type: 'string', description: 'Keywords to match in comment text or file paths.' },
					maxResults: { type: 'number', description: 'Maximum results (default 15).' },
				},
				required: ['query'],
				additionalProperties: false,
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'search_workspace_diagnostics',
			description: 'Search indexed compiler/linter diagnostics (errors and warnings) from the workspace.',
			parameters: {
				type: 'object',
				properties: {
					query: { type: 'string', description: 'Keywords to match in diagnostic messages or paths.' },
					maxResults: { type: 'number', description: 'Maximum results (default 15).' },
				},
				required: ['query'],
				additionalProperties: false,
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'list_workspace_folders',
			description: 'List workspace root folders and linked roots available to the agent.',
			parameters: { type: 'object', properties: {}, additionalProperties: false },
		},
	},
	{
		type: 'function',
		function: {
			name: 'get_project_manifests',
			description: 'Detect and summarize project manifests (package.json, pyproject.toml, Cargo.toml, go.mod, etc.) with names, versions, and scripts.',
			parameters: {
				type: 'object',
				properties: { maxManifests: { type: 'number', description: 'Maximum manifests to parse (default 12).' } },
				additionalProperties: false,
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'discover_workspace_tests',
			description: 'Discover runnable tests and lint targets from manifests and test file patterns in the workspace.',
			parameters: { type: 'object', properties: {}, additionalProperties: false },
		},
	},
	{
		type: 'function',
		function: {
			name: 'format_workspace',
			description: 'Run format or lint on the workspace or a single file (format | lint).',
			parameters: {
				type: 'object',
				properties: {
					action: { type: 'string', enum: ['format', 'lint'], description: 'format or lint' },
					path: { type: 'string', description: 'Optional workspace-relative file for single-file format.' },
				},
				required: ['action'],
				additionalProperties: false,
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'search_code_with_preview',
			description: 'Semantic + symbol search with code excerpt previews for chat navigation.',
			parameters: {
				type: 'object',
				properties: {
					query: { type: 'string', description: 'Search query.' },
					maxResults: { type: 'number', description: 'Max hits with previews (default 8).' },
				},
				required: ['query'],
				additionalProperties: false,
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'search_workspace_documentation',
			description: 'Search comments, docstrings, and README-style documentation in the indexed workspace.',
			parameters: {
				type: 'object',
				properties: {
					query: { type: 'string', description: 'Documentation search terms.' },
					maxResults: { type: 'number', description: 'Maximum results (default 15).' },
				},
				required: ['query'],
				additionalProperties: false,
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'search_external_retrieval',
			description: 'Search external retrieval providers registered by QuantumIDE plugins (docs, APIs, remote corpora).',
			parameters: {
				type: 'object',
				properties: {
					query: { type: 'string', description: 'Natural language or keyword query.' },
					maxResults: { type: 'number', description: 'Maximum results (default 10).' },
				},
				required: ['query'],
				additionalProperties: false,
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'search_semantic_workspace',
			description: 'Semantic (TF-IDF) search over the indexed workspace. Falls back to search_workspace_text when index is unavailable. Optional target_directories globs narrow results.',
			parameters: {
				type: 'object',
				properties: {
					query: { type: 'string', description: 'Natural language or keyword query.' },
					maxResults: { type: 'number', description: 'Maximum results (default 15).' },
					target_directories: {
						type: 'array',
						items: { type: 'string' },
						description: 'Optional directory prefixes to limit search (e.g. src/, StillnessCompiler/).',
					},
				},
				required: ['query'],
				additionalProperties: false,
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'apply_workspace_patch',
			description: 'Apply a reviewable patch to one file. Patch format: lines between +++ REPLACE and +++ WITH markers, or full file body for new files.',
			parameters: {
				type: 'object',
				properties: {
					path: { type: 'string', description: 'Workspace-relative file path.' },
					patch: { type: 'string', description: 'Patch content with +++ REPLACE / +++ WITH sections or full file text.' },
				},
				required: ['path', 'patch'],
				additionalProperties: false,
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'restore_workspace_checkpoint',
			description: 'Restore a file from a checkpoint created by apply_workspace_edits or apply_workspace_patch.',
			parameters: {
				type: 'object',
				properties: {
					checkpointId: { type: 'string', description: 'Checkpoint UUID returned when the edit was applied.' },
				},
				required: ['checkpointId'],
				additionalProperties: false,
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'apply_workspace_edits',
			description: 'Apply coordinated create/write/delete edits across multiple workspace files. Prefer this over serial propose_file_edit for multi-file tasks.',
			parameters: {
				type: 'object',
				properties: {
					summary: { type: 'string', description: 'Short summary of the coordinated change.' },
					edits: {
						type: 'array',
						description: 'Ordered list of file operations.',
						items: {
							type: 'object',
							properties: {
								operation: { type: 'string', enum: ['create', 'write', 'delete'] },
								path: { type: 'string' },
								content: { type: 'string', description: 'Full file content for create/write operations.' },
							},
							required: ['operation', 'path'],
							additionalProperties: false,
						},
					},
				},
				required: ['edits'],
				additionalProperties: false,
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'lookup_type_hierarchy',
			description: 'Look up type/symbol hierarchy from the workspace AST index.',
			parameters: {
				type: 'object',
				properties: { typeName: { type: 'string' } },
				required: ['typeName'],
				additionalProperties: false,
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'search_architectural_patterns',
			description: 'Retrieve files matching an architecture pattern (mvc, repository, service, etc.).',
			parameters: {
				type: 'object',
				properties: {
					pattern: { type: 'string', enum: ['mvc', 'layered', 'repository', 'service', 'singleton', 'factory', 'observer', 'middleware'] },
					maxResults: { type: 'number' },
				},
				required: ['pattern'],
				additionalProperties: false,
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'detect_edit_conflicts',
			description: 'Validate a proposed apply_workspace_edits payload for conflicts before applying.',
			parameters: {
				type: 'object',
				properties: { edits: { type: 'array', items: { type: 'object' } } },
				required: ['edits'],
				additionalProperties: false,
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'suggest_dependent_files',
			description: 'Suggest files that may need updates when a path changes (dependency graph).',
			parameters: {
				type: 'object',
				properties: { path: { type: 'string' } },
				required: ['path'],
				additionalProperties: false,
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'extract_component',
			description: 'Extract JSX/component lines into a new file and import it.',
			parameters: {
				type: 'object',
				properties: {
					path: { type: 'string' },
					componentName: { type: 'string' },
					targetPath: { type: 'string' },
					startLine: { type: 'number' },
					endLine: { type: 'number' },
				},
				required: ['path', 'componentName', 'targetPath', 'startLine', 'endLine'],
				additionalProperties: false,
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'move_module',
			description: 'Move a module to a new path (updates moved file content).',
			parameters: {
				type: 'object',
				properties: { fromPath: { type: 'string' }, toPath: { type: 'string' } },
				required: ['fromPath', 'toPath'],
				additionalProperties: false,
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'migrate_api',
			description: 'Rename an API identifier across a file.',
			parameters: {
				type: 'object',
				properties: { path: { type: 'string' }, fromApi: { type: 'string' }, toApi: { type: 'string' } },
				required: ['path', 'fromApi', 'toApi'],
				additionalProperties: false,
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'migrate_framework',
			description: 'Rewrite framework import roots in a file.',
			parameters: {
				type: 'object',
				properties: { path: { type: 'string' }, fromFramework: { type: 'string' }, toFramework: { type: 'string' } },
				required: ['path', 'fromFramework', 'toFramework'],
				additionalProperties: false,
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'generate_test_scaffold',
			description: 'Generate a test file scaffold for a source file.',
			parameters: {
				type: 'object',
				properties: { sourcePath: { type: 'string' }, exportName: { type: 'string' } },
				required: ['sourcePath'],
				additionalProperties: false,
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'update_package_dependency',
			description: 'Update a dependency version in package.json.',
			parameters: {
				type: 'object',
				properties: { packageName: { type: 'string' }, version: { type: 'string' } },
				required: ['packageName', 'version'],
				additionalProperties: false,
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'run_workspace_check',
			description: 'Run verification: compile, verify, lint, test, or custom script.',
			parameters: {
				type: 'object',
				properties: {
					check: {
						type: 'string',
						enum: ['compile', 'verify', 'lint', 'test', 'custom'],
						description: 'compile | verify | lint (npm run lint if present) | test (npm test) | custom script',
					},
					script: { type: 'string', description: 'Workspace-relative script path when check is custom.' },
				},
				required: ['check'],
				additionalProperties: false,
			},
		},
	},
	...QUANTUMIDE_HOST_WORKFLOW_TOOLS,
];

const DEFAULT_MAX_SEARCH_RESULTS = 20;
const DEFAULT_MAX_SYMBOLS = 40;
const DEFAULT_MAX_READ_CHARS = 12_000;
const MAX_FILES_TO_SCAN = 400;
const MAX_VERIFY_OUTPUT_CHARS = 24_000;
/** Cap compile/lint so a single agent verify cannot block for 20+ minutes. */
const VERIFY_TIMEOUT_MS = 180_000;

const hostIgnorePolicyCache = new Map<string, IQuantumIDEWorkspaceIgnorePolicy>();

async function getHostIgnorePolicy(
	fileService: IFileService,
	workingDirectory: URI | undefined,
	context: IOpenAIHostToolContext,
): Promise<IQuantumIDEWorkspaceIgnorePolicy> {
	const links = context.workspaceLinks ?? (workingDirectory ? await loadWorkspaceLinks(fileService, workingDirectory) : []);
	const roots = collectAgentSearchRoots(workingDirectory, links);
	const key = roots.map(r => r.fsPath).join('|') || 'none';
	let policy = hostIgnorePolicyCache.get(key);
	if (!policy) {
		policy = await loadQuantumIDEWorkspaceIgnorePolicy(fileService, roots, QuantumIDEWorkspaceIndexExcludeNames, [], {
			unifiedIgnoreFile: context.ignoreFile,
		});
		hostIgnorePolicyCache.set(key, policy);
	}
	return policy;
}

async function resolveWorkspacePathForHost(
	fileService: IFileService,
	workingDirectory: URI | undefined,
	pathArg: string,
	context: IOpenAIHostToolContext,
	mode: 'read' | 'list',
): Promise<URI> {
	const links = context.workspaceLinks ?? (workingDirectory ? await loadWorkspaceLinks(fileService, workingDirectory) : []);
	const resource = resolveWorkspacePath(workingDirectory, pathArg, { ...context, workspaceLinks: links });
	const roots = collectAgentSearchRoots(workingDirectory, links);
	const rel = relativePathInWorkspaceRoots(resource, roots) ?? pathArg;
	const policy = await getHostIgnorePolicy(fileService, workingDirectory, context);
	if (isQuantumIDEPathIgnored(rel, policy, 'ai', resource.path.split('/').pop())) {
		throw new Error(`Path is blocked by ${QUANTUMIDE_IGNORE_FILE} or workspace ignore policy: ${pathArg}`);
	}
	console.info(formatQuantumIDEWorkspaceDiscoveryLog({
		component: mode === 'read' ? 'agent-read' : 'agent-search',
		operation: 'resolve-path',
		matchCount: 1,
	}));
	return resource;
}

export async function executeOpenAIHostTool(
	fileService: IFileService,
	workingDirectory: URI | undefined,
	toolName: string,
	args: Record<string, unknown>,
	context: IOpenAIHostToolContext = {},
): Promise<string> {
	const enrichedContext: IOpenAIHostToolContext = {
		...context,
		workspaceLinks: context.workspaceLinks ?? (workingDirectory ? await loadWorkspaceLinks(fileService, workingDirectory) : []),
	};
	if (isQuantumIDEWorkspaceFileMutatingHostTool(toolName, { autoApplyEdits: enrichedContext.autoApplyEdits })) {
		await assertQuantumIDEWorkspaceWritableForTool(
			fileService,
			workingDirectory,
			enrichedContext.workspaceLinks,
			toolName,
			enrichedContext.workspaceReadonly,
		);
	}
	switch (toolName) {
		case 'search_workspace_text':
			return searchWorkspaceText(fileService, workingDirectory, args, enrichedContext);
		case 'search_workspace_text_batch':
			return searchWorkspaceTextBatch(fileService, workingDirectory, args, enrichedContext);
		case 'read_workspace_file':
			return readWorkspaceFile(fileService, workingDirectory, args, enrichedContext);
		case 'list_workspace_directory':
			return listWorkspaceDirectory(fileService, workingDirectory, args, enrichedContext);
		case 'file_search':
		case 'search_workspace_files':
			return searchWorkspaceFiles(fileService, workingDirectory, args, enrichedContext);
		case 'list_workspace_symbols':
			return listWorkspaceSymbols(fileService, workingDirectory, args, enrichedContext);
		case 'search_workspace_symbols':
			return searchWorkspaceSymbols(fileService, workingDirectory, typeof args.query === 'string' ? args.query : '', typeof args.maxResults === 'number' ? args.maxResults : undefined);
		case 'find_symbol_references':
			return findSymbolReferences(fileService, workingDirectory, typeof args.symbol === 'string' ? args.symbol : '', typeof args.maxResults === 'number' ? args.maxResults : undefined);
		case 'resolve_import_dependencies': {
			const pathArg = typeof args.path === 'string' ? args.path.trim() : '';
			if (!pathArg) {
				throw new Error('resolve_import_dependencies requires a path.');
			}
			return resolveImportDependencies(fileService, workingDirectory, pathArg);
		}
		case 'search_workspace_comments':
			return searchWorkspaceComments(fileService, workingDirectory, args, enrichedContext);
		case 'search_workspace_diagnostics':
			return searchWorkspaceDiagnostics(fileService, workingDirectory, args, enrichedContext);
		case 'list_workspace_folders':
			return listWorkspaceFolders(workingDirectory, enrichedContext);
		case 'get_project_manifests':
			return getProjectManifests(fileService, workingDirectory, args);
		case 'discover_workspace_tests':
			return discoverWorkspaceTests(fileService, workingDirectory);
		case 'format_workspace':
			return formatWorkspace(workingDirectory, args, fileService, enrichedContext);
		case 'search_code_with_preview':
			return searchCodeWithPreview(fileService, workingDirectory, args, enrichedContext);
		case 'search_workspace_documentation':
			return searchWorkspaceDocumentation(fileService, workingDirectory, args);
		case 'search_external_retrieval':
			return searchExternalRetrieval(args, enrichedContext);
		case 'search_semantic_workspace':
			return searchSemanticWorkspace(fileService, workingDirectory, args, enrichedContext);
		case 'search_vector_workspace':
			return searchVectorWorkspace(fileService, workingDirectory, args, enrichedContext);
		case 'query_dependency_graph':
			return queryDependencyGraph(fileService, workingDirectory, args, enrichedContext);
		case 'find_implementations':
			return findSymbolReferences(fileService, workingDirectory, typeof args.symbol === 'string' ? args.symbol : '', typeof args.maxResults === 'number' ? args.maxResults : 25);
		case 'normalize_imports':
			return refactorWorkspaceFile(fileService, workingDirectory, args, (path, content) => normalizeImportsInFile(path, content), enrichedContext);
		case 'rewrite_imports': {
			const fromSpecifier = typeof args.fromSpecifier === 'string' ? args.fromSpecifier : '';
			const toSpecifier = typeof args.toSpecifier === 'string' ? args.toSpecifier : '';
			return refactorWorkspaceFile(fileService, workingDirectory, args, (path, content) => rewriteImportsInFile(path, content, fromSpecifier, toSpecifier), enrichedContext);
		}
		case 'extract_method': {
			const pathArg = typeof args.path === 'string' ? args.path.trim() : '';
			const startLine = typeof args.startLine === 'number' ? args.startLine : 0;
			const endLine = typeof args.endLine === 'number' ? args.endLine : 0;
			const methodName = typeof args.methodName === 'string' ? args.methodName.trim() : '';
			if (!pathArg || !methodName || startLine <= 0 || endLine <= 0) {
				throw new Error('extract_method requires path, startLine, endLine, and methodName.');
			}
			return refactorWorkspaceFile(fileService, workingDirectory, { path: pathArg }, (path, content) => extractMethodInFile(path, content, startLine, endLine, methodName), enrichedContext);
		}
		case 'apply_workspace_patch': {
			const pathArg = typeof args.path === 'string' ? args.path.trim() : '';
			const patch = typeof args.patch === 'string' ? args.patch : '';
			if (!pathArg || !patch) {
				throw new Error('apply_workspace_patch requires path and patch.');
			}
			const patchIndexGate = await getIndexingGateMessage(
				fileService,
				workingDirectory,
				enrichedContext.waitForIndexingBeforeEdits === true,
			);
			if (patchIndexGate) {
				return patchIndexGate;
			}
			const patchVelocity: QuantumIDEAgentEditVelocity = context.editVelocity
				?? (context.fastApplyEdits ? 'fast' : 'safe');
			const effectivePatchVelocity = resolveEffectiveEditVelocity({ editVelocity: patchVelocity }, [pathArg]);
			const result = await applyUnifiedPatchToFile(fileService, workingDirectory, pathArg, patch, {
				createCheckpoint: effectivePatchVelocity === 'safe',
			});
			return result.ok
				? `${result.message}${result.checkpointId ? ` (checkpoint ${result.checkpointId})` : ''}`
				: `Failed: ${result.message}`;
		}
		case 'restore_workspace_checkpoint': {
			const checkpointId = typeof args.checkpointId === 'string' ? args.checkpointId.trim() : '';
			if (!checkpointId || !workingDirectory) {
				throw new Error('restore_workspace_checkpoint requires checkpointId and a workspace folder.');
			}
			const restoredPath = await restoreEditCheckpoint(fileService, workingDirectory, checkpointId);
			return `Restored checkpoint ${checkpointId} for ${restoredPath}`;
		}
		case 'apply_workspace_edits':
			return applyWorkspaceEdits(fileService, workingDirectory, args, enrichedContext);
		case 'lookup_type_hierarchy':
			return lookupTypeHierarchy(fileService, workingDirectory, args);
		case 'search_architectural_patterns':
			return searchArchitecturalPatternsTool(fileService, workingDirectory, args);
		case 'detect_edit_conflicts':
			return detectEditConflictsTool(args);
		case 'suggest_dependent_files':
			return suggestDependentFilesTool(fileService, workingDirectory, args);
		case 'extract_component':
			return extractComponentTool(fileService, workingDirectory, args, enrichedContext);
		case 'move_module':
			return moveModuleTool(fileService, workingDirectory, args, enrichedContext);
		case 'migrate_api':
			return refactorWorkspaceFile(fileService, workingDirectory, args, (path, content) => migrateApiInFile(path, content, String(args.fromApi ?? ''), String(args.toApi ?? '')), enrichedContext);
		case 'migrate_framework':
			return refactorWorkspaceFile(fileService, workingDirectory, args, (path, content) => migrateFrameworkImports(path, content, String(args.fromFramework ?? ''), String(args.toFramework ?? '')), enrichedContext);
		case 'generate_test_scaffold':
			return generateTestScaffoldTool(fileService, workingDirectory, args, enrichedContext);
		case 'update_package_dependency':
			return updatePackageDependencyTool(fileService, workingDirectory, args, enrichedContext);
		case 'run_workspace_check':
			return runWorkspaceCheck(workingDirectory, args, fileService);
		case 'rename_symbol':
			return renameSymbolTool(fileService, workingDirectory, args, enrichedContext);
		case 'scaffold_project':
		case 'run_repl_snippet':
		case 'expand_query_context':
		case 'analyze_code_review':
		case 'run_framework_workflow':
		case 'run_git_operation':
		case 'manage_dependency':
			return executeQuantumIDEHostWorkflowTool(fileService, workingDirectory, toolName, args, enrichedContext);
		default: {
			const pluginResult = await executeQuantumIDEPluginHostTool(toolName, args);
			if (pluginResult !== undefined) {
				return pluginResult;
			}
			throw new Error(`Unknown host tool: ${toolName}`);
		}
	}
}

export function getOpenAIHostActivityTools(): readonly IOpenAIToolDefinition[] {
	return [...OPENAI_HOST_ACTIVITY_TOOLS, ...getQuantumIDEPluginHostToolDefinitions()];
}

export function isOpenAIHostTool(toolName: string): boolean {
	return isReadOnlyOpenAIHostTool(toolName)
		|| isQuantumIDEPluginHostTool(toolName)
		|| toolName === 'run_workspace_check'
		|| toolName === 'apply_workspace_edits'
		|| toolName === 'apply_workspace_patch'
		|| toolName === 'restore_workspace_checkpoint'
		|| toolName === 'scaffold_project'
		|| toolName === 'run_framework_workflow'
		|| toolName === 'run_git_operation'
		|| toolName === 'manage_dependency';
}

async function readIndexPayload(raw: string, workspaceKey: string): Promise<string> {
	if (!isEncryptedQuantumIDEIndexPayload(raw)) {
		return raw;
	}
	return decryptQuantumIDEIndexPayload(raw, workspaceKey);
}

export { isReadOnlyOpenAIHostTool, isQuantumIDERefactorHostTool };

async function discoveryFallbackWhenIndexingDisabled(
	fileService: IFileService,
	workingDirectory: URI | undefined,
	args: Record<string, unknown>,
	context: IOpenAIHostToolContext | undefined,
	indexedToolName: string,
): Promise<string | undefined> {
	if (context?.indexingEnabled !== false) {
		return undefined;
	}
	const query = typeof args.query === 'string' ? args.query.trim() : '';
	const maxResults = typeof args.maxResults === 'number' && args.maxResults > 0 ? Math.min(args.maxResults, 30) : 15;
	const fallback = await searchWorkspaceText(fileService, workingDirectory, { query, maxResults }, context ?? {});
	return formatQuantumIDEIndexingOffToolFallback(indexedToolName, fallback);
}

export async function loadWorkspaceLinks(fileService: IFileService, workingDirectory: URI | undefined): Promise<IQuantumIDEWorkspaceLink[]> {
	if (!workingDirectory) {
		return [];
	}
	const linksFile = joinPath(workingDirectory, QUANTUMIDE_WORKSPACE_LINKS_FILE);
	try {
		const raw = (await fileService.readFile(linksFile)).value.toString();
		return parseWorkspaceLinksJson(raw);
	} catch {
		return [];
	}
}

export async function loadWorkspaceLinkRoots(fileService: IFileService, workingDirectory: URI | undefined): Promise<URI[]> {
	return (await loadWorkspaceLinks(fileService, workingDirectory))
		.map(link => URI.file(link.path))
		.filter(uri => uri.fsPath.length > 0);
}

export function formatStructuredCompileErrors(stdout: string, stderr: string): string {
	const combined = `${stdout}\n${stderr}`;
	const errorLines = combined
		.split(/\r?\n/)
		.filter(line => /\berror\b/i.test(line) || /:\d+:\d+/.test(line) || /TS\d{4}/.test(line))
		.slice(0, 40);
	if (errorLines.length === 0) {
		return combined.slice(-MAX_VERIFY_OUTPUT_CHARS);
	}
	return `Structured errors (${errorLines.length} line(s)):\n${errorLines.join('\n')}`;
}

async function readWorkspaceFile(fileService: IFileService, workingDirectory: URI | undefined, args: Record<string, unknown>, context: IOpenAIHostToolContext): Promise<string> {
	const pathArg = typeof args.path === 'string' ? args.path.trim() : '';
	if (!pathArg) {
		throw new Error('read_workspace_file requires a path.');
	}
	const start = Date.now();
	const resource = await resolveWorkspacePathForHost(fileService, workingDirectory, pathArg, context, 'read');
	const maxChars = typeof args.maxChars === 'number' && args.maxChars > 0 ? Math.min(args.maxChars, 48_000) : DEFAULT_MAX_READ_CHARS;
	const STREAM_READ_THRESHOLD = 512 * 1024;
	let text: string;
	try {
		const stat = await fileService.stat(resource);
		if (!stat.isDirectory && typeof stat.size === 'number' && stat.size > STREAM_READ_THRESHOLD) {
			const chunk = await fileService.readFile(resource, { length: STREAM_READ_THRESHOLD });
			text = chunk.value.toString();
			text += `\n\n[read first ${STREAM_READ_THRESHOLD} bytes of ${stat.size}; use startLine/endLine for partial reads]`;
		} else {
			text = (await fileService.readFile(resource)).value.toString();
		}
	} catch {
		text = (await fileService.readFile(resource)).value.toString();
	}
	const startLine = getLineNumberArg(args, 'startLine', 'start_line');
	if (startLine !== undefined) {
		const lines = text.split(/\r?\n/);
		const start = startLine - 1;
		const endLine = getLineNumberArg(args, 'endLine', 'end_line');
		const end = endLine !== undefined ? Math.min(lines.length, endLine) : start + 1;
		text = lines.slice(start, end).join('\n');
	}
	if (text.length <= maxChars) {
		console.info(formatQuantumIDEWorkspaceDiscoveryLog({
			component: 'agent-read',
			operation: 'read',
			durationMs: Date.now() - start,
			fileCount: 1,
		}));
		return text;
	}
	console.info(formatQuantumIDEWorkspaceDiscoveryLog({
		component: 'agent-read',
		operation: 'read-truncated',
		durationMs: Date.now() - start,
		truncated: true,
	}));
	return `${text.slice(0, maxChars)}\n\n[truncated to ${maxChars} characters]`;
}

async function listWorkspaceDirectory(
	fileService: IFileService,
	workingDirectory: URI | undefined,
	args: Record<string, unknown>,
	context: IOpenAIHostToolContext,
): Promise<string> {
	const pathArg = typeof args.path === 'string' && args.path.trim() ? args.path.trim() : '.';
	const maxEntries = typeof args.maxEntries === 'number' && args.maxEntries > 0 ? Math.min(args.maxEntries, 200) : 80;
	const resource = await resolveWorkspacePathForHost(fileService, workingDirectory, pathArg, context, 'list');
	const stat = await fileService.resolve(resource);
	if (!stat.isDirectory) {
		throw new Error(`Not a directory: ${pathArg}`);
	}
	const links = context.workspaceLinks ?? (workingDirectory ? await loadWorkspaceLinks(fileService, workingDirectory) : []);
	const roots = collectAgentSearchRoots(workingDirectory, links);
	const policy = await getHostIgnorePolicy(fileService, workingDirectory, context);
	const lines: string[] = [];
	for (const child of (stat.children ?? []).sort((a, b) => a.name.localeCompare(b.name))) {
		if (lines.length >= maxEntries) {
			lines.push(`… truncated after ${maxEntries} entries`);
			break;
		}
		const rel = relativePathInWorkspaceRoots(child.resource, roots) ?? child.name;
		if (isQuantumIDEPathIgnored(rel, policy, 'ai', child.name)) {
			continue;
		}
		lines.push(`${child.isDirectory ? '[dir]' : '[file]'} ${rel}`);
	}
	return lines.length ? `Directory ${pathArg}:\n\n${lines.join('\n')}` : `Directory ${pathArg} is empty (or all entries are ignored).`;
}

async function searchWorkspaceFiles(
	fileService: IFileService,
	workingDirectory: URI | undefined,
	args: Record<string, unknown>,
	context: IOpenAIHostToolContext,
): Promise<string> {
	const query = typeof args.query === 'string' ? args.query.trim() : '';
	if (!query) {
		throw new Error('search_workspace_files requires a query.');
	}
	const maxResults = typeof args.maxResults === 'number' && args.maxResults > 0 ? Math.min(args.maxResults, 30) : 10;
	const roots = await resolveSearchRoots(fileService, workingDirectory, context);
	const policy = await getHostIgnorePolicy(fileService, workingDirectory, context);
	const paths: string[] = [];
	for (const root of roots) {
		await scanDirectory(fileService, root, async (resource) => {
			if (paths.length >= 8_000) {
				return;
			}
			const rel = relativePathInWorkspaceRoots(resource, roots);
			if (!rel || isQuantumIDEPathIgnored(rel, policy, 'ai')) {
				return;
			}
			try {
				const st = await fileService.stat(resource);
				if (!st.isDirectory) {
					paths.push(rel);
				}
			} catch {
				// skip
			}
		}, policy, roots);
	}
	const matches = quantumideFuzzyMatchFilePaths(query, paths, maxResults);
	console.info(formatQuantumIDEWorkspaceDiscoveryLog({
		component: 'agent-search',
		operation: 'fuzzy-path',
		matchCount: matches.length,
		fileCount: paths.length,
	}));
	if (matches.length === 0) {
		return `No file paths matched "${query}" (searched ${paths.length} indexed paths).`;
	}
	return `File path matches for "${query}":\n\n${matches.map(m => `- ${m.path}`).join('\n')}`;
}

async function listWorkspaceSymbols(fileService: IFileService, workingDirectory: URI | undefined, args: Record<string, unknown>, context: IOpenAIHostToolContext): Promise<string> {
	const pathArg = typeof args.path === 'string' ? args.path.trim() : '';
	if (!pathArg) {
		throw new Error('list_workspace_symbols requires a path.');
	}
	const maxResults = typeof args.maxResults === 'number' && args.maxResults > 0 ? Math.min(args.maxResults, 100) : DEFAULT_MAX_SYMBOLS;
	const normalizedPath = pathArg.replace(/\\/g, '/');
	if (workingDirectory) {
		try {
			const raw = (await fileService.readFile(joinPath(workingDirectory, QUANTUMIDE_SYMBOL_INDEX_FILE))).value.toString();
			const parsed = JSON.parse(raw) as { symbols?: IQuantumIDEAstSymbolEntry[] };
			const indexed = (parsed.symbols ?? []).filter(s => s.path.replace(/\\/g, '/') === normalizedPath || s.path.endsWith(`/${normalizedPath}`));
			if (indexed.length > 0) {
				return `Symbols in ${pathArg} (workspace index):\n\n${indexed.slice(0, maxResults).map(s => `${s.line}: ${s.kind} ${s.name}`).join('\n')}`;
			}
		} catch {
			// fall through to file parse
		}
	}
	const resource = await resolveWorkspacePathForHost(fileService, workingDirectory, pathArg, context, 'read');
	const text = (await fileService.readFile(resource)).value.toString();
	const lines = text.split(/\r?\n/);
	const symbols: string[] = [];
	const patterns = [
		/^\s*(?:export\s+)?(?:async\s+)?(?:function|class|interface|type|enum)\s+(\w+)/,
		/^\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*[=:]/,
		/^\s*export\s*\{\s*([^}]+)\}/,
	];
	for (let i = 0; i < lines.length && symbols.length < maxResults; i++) {
		const line = lines[i];
		for (const pattern of patterns) {
			const match = line.match(pattern);
			if (match) {
				const name = match[1].split(',')[0].trim();
				if (name) {
					symbols.push(`${i + 1}: ${name}`);
					break;
				}
			}
		}
	}
	if (symbols.length === 0) {
		return `No symbols found in ${pathArg}.`;
	}
	return `Symbols in ${pathArg}:\n\n${symbols.join('\n')}`;
}

function getLineNumberArg(args: Record<string, unknown>, key: 'startLine' | 'endLine', snakeKey: 'start_line' | 'end_line'): number | undefined {
	const value = args[key] ?? args[snakeKey];
	return typeof value === 'number' && Number.isFinite(value) ? Math.max(1, Math.floor(value)) : undefined;
}

async function searchWorkspaceText(
	fileService: IFileService,
	workingDirectory: URI | undefined,
	args: Record<string, unknown>,
	context: IOpenAIHostToolContext,
): Promise<string> {
	const query = typeof args.query === 'string' ? args.query.trim() : '';
	if (!query) {
		throw new Error('search_workspace_text requires a query.');
	}
	const maxResults = typeof args.maxResults === 'number' && args.maxResults > 0 ? Math.min(args.maxResults, 50) : DEFAULT_MAX_SEARCH_RESULTS;
	const roots = await resolveSearchRoots(fileService, workingDirectory, context);
	const policy = await getHostIgnorePolicy(fileService, workingDirectory, context);
	if (roots.length === 1) {
		return searchSingleRoot(fileService, roots[0], query, maxResults, policy);
	}
	const sections: string[] = [];
	for (const root of roots) {
		const section = await searchSingleRoot(fileService, root, query, maxResults, policy);
		sections.push(`### ${root.fsPath}\n${section}`);
	}
	return sections.join('\n\n');
}

async function searchWorkspaceTextBatch(
	fileService: IFileService,
	workingDirectory: URI | undefined,
	args: Record<string, unknown>,
	context: IOpenAIHostToolContext,
): Promise<string> {
	const queries = Array.isArray(args.queries)
		? args.queries.filter((q): q is string => typeof q === 'string' && q.trim().length > 0).map(q => q.trim()).slice(0, 12)
		: [];
	if (queries.length === 0) {
		throw new Error('search_workspace_text_batch requires a non-empty queries array.');
	}
	const maxPerQuery = typeof args.maxResultsPerQuery === 'number' && args.maxResultsPerQuery > 0
		? Math.min(args.maxResultsPerQuery, 30)
		: 12;
	const batchPromise = Promise.all(queries.map(async query => {
		const body = await searchWorkspaceText(fileService, workingDirectory, { query, maxResults: maxPerQuery }, context);
		return `## Query: ${query}\n${body}`;
	}));
	const timeoutPromise = new Promise<string>((_, reject) => {
		setTimeout(() => reject(new Error('search_workspace_text_batch timed out after 60s')), 60_000);
	});
	try {
		const results = await Promise.race([batchPromise, timeoutPromise]);
		return (results as string[]).join('\n\n');
	} catch (err) {
		return `Batch search failed: ${err instanceof Error ? err.message : String(err)}. Try fewer queries or use search_workspace_text.`;
	}
}

async function resolveSearchRoots(
	fileService: IFileService,
	workingDirectory: URI | undefined,
	context: IOpenAIHostToolContext,
): Promise<URI[]> {
	const links = context.workspaceLinks ?? await loadWorkspaceLinks(fileService, workingDirectory);
	if (context.crossRootSearch === false) {
		return workingDirectory ? [workingDirectory] : [URI.file('/')];
	}
	return collectAgentSearchRoots(workingDirectory, links);
}

async function searchSingleRoot(
	fileService: IFileService,
	root: URI,
	query: string,
	maxResults: number,
	policy?: IQuantumIDEWorkspaceIgnorePolicy,
): Promise<string> {
	const rgResult = await searchQuantumIDEWorkspaceTextWithRipgrep(root.fsPath, query, maxResults);
	if (rgResult) {
		const filtered = policy
			? rgResult.matches.filter(line => {
				const pathPart = line.split(':')[0] ?? '';
				return !isQuantumIDEPathIgnored(pathPart, policy, 'ai');
			})
			: rgResult.matches;
		if (filtered.length === 0) {
			return `No matches found for "${query}".`;
		}
		console.info(formatQuantumIDEWorkspaceDiscoveryLog({
			component: 'agent-search',
			operation: `ripgrep query=${JSON.stringify(query)}`,
			matchCount: filtered.length,
			durationMs: rgResult.durationMs,
		}));
		return `Found ${filtered.length} match(es) for "${query}" (ripgrep):\n\n${filtered.join('\n')}`;
	}
	const matches: string[] = [];
	let scanned = 0;
	await scanDirectory(fileService, root, async (resource) => {
		if (matches.length >= maxResults || scanned >= MAX_FILES_TO_SCAN) {
			return;
		}
		scanned++;
		try {
			if (!(await fileService.canHandleResource(resource))) {
				return;
			}
			const stat = await fileService.stat(resource);
			if (stat.isDirectory || stat.size > 512_000) {
				return;
			}
			const text = (await fileService.readFile(resource)).value.toString();
			const index = text.toLowerCase().indexOf(query.toLowerCase());
			if (index === -1) {
				return;
			}
			const start = Math.max(0, index - 60);
			const excerpt = text.slice(start, start + 160).replace(/\s+/g, ' ').trim();
			matches.push(`${resource.fsPath}: …${excerpt}…`);
		} catch {
			// skip unreadable files
		}
	}, policy, [root]);
	if (matches.length === 0) {
		console.info(formatQuantumIDEWorkspaceDiscoveryLog({
			component: 'agent-search',
			operation: 'scan-fallback',
			fileCount: scanned,
			fallback: 'directory-scan',
		}));
		return `No matches found for "${query}" (scanned ${scanned} files).`;
	}
	console.info(formatQuantumIDEWorkspaceDiscoveryLog({
		component: 'agent-search',
		operation: 'scan-fallback',
		matchCount: matches.length,
		fileCount: scanned,
		fallback: 'directory-scan',
	}));
	return `Found ${matches.length} match(es) for "${query}" (scanned ${scanned} files):\n\n${matches.join('\n')}`;
}

async function resolveTaskCommand(workingDirectory: URI | undefined, check: string, fileService: IFileService): Promise<{ command: string; cmdArgs: string[] } | undefined> {
	if (!workingDirectory) {
		return undefined;
	}
	try {
		const tasksPath = joinPath(workingDirectory, '.vscode/tasks.json');
		const raw = (await fileService.readFile(tasksPath)).value.toString();
		const parsed = JSON.parse(raw) as { tasks?: { label?: string; script?: string; command?: string; args?: string[] }[] };
		const label = check === 'compile' ? 'compile' : check;
		const task = parsed.tasks?.find(item => item.label?.toLowerCase() === label);
		if (!task) {
			return undefined;
		}
		if (task.script) {
			return { command: 'npm', cmdArgs: ['run', task.script] };
		}
		if (task.command) {
			return { command: task.command, cmdArgs: task.args ?? [] };
		}
	} catch {
		// fall through to defaults
	}
	return undefined;
}

async function runWorkspaceCheck(workingDirectory: URI | undefined, args: Record<string, unknown>, fileService: IFileService): Promise<string> {
	const check = typeof args.check === 'string' ? args.check : 'compile';
	const scopePath = typeof args.path === 'string' ? args.path.trim() : '';
	if (check === 'compile' && scopePath && isDocumentationPath(scopePath)) {
		return `Skipped compile for documentation path ${scopePath}. No TypeScript compile is required for HTML/Markdown user-guide edits.`;
	}
	const cwd = workingDirectory?.fsPath ?? process.cwd();
	const taskCommand = await resolveTaskCommand(workingDirectory, check, fileService);
	let command: string;
	let cmdArgs: string[];
	if (taskCommand) {
		command = taskCommand.command;
		cmdArgs = taskCommand.cmdArgs;
	} else {
		switch (check) {
		case 'lint':
			command = 'npm';
			cmdArgs = ['run', 'lint'];
			break;
		case 'test':
			command = 'npm';
			cmdArgs = ['test'];
			break;
		case 'verify':
			command = 'bash';
			cmdArgs = ['scripts/agent-verify.sh'];
			break;
		case 'custom': {
			const script = typeof args.script === 'string' ? args.script.trim() : '';
			if (!script) {
				throw new Error('run_workspace_check with check=custom requires a script path.');
			}
			command = 'bash';
			cmdArgs = [script];
			break;
		}
		case 'compile':
		default:
			command = 'npm';
			cmdArgs = ['run', 'compile'];
			break;
		}
	}
	const { code, stdout, stderr } = await runShellCommand(command, cmdArgs, cwd, VERIFY_TIMEOUT_MS);
	const trimmedOut = (stdout + stderr).slice(-MAX_VERIFY_OUTPUT_CHARS);
	if (code === 0) {
		return `Check "${check}" succeeded.\n\n${trimmedOut}`.trim();
	}
	const structured = formatStructuredCompileErrors(stdout, stderr);
	return `Check "${check}" failed (exit ${code}).\n\n${structured}`;
}

function runShellCommand(command: string, args: string[], cwd: string, timeoutMs: number): Promise<{ code: number; stdout: string; stderr: string }> {
	return new Promise(resolve => {
		const child = spawn(command, args, { cwd, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
		let stdout = '';
		let stderr = '';
		child.stdout?.on('data', chunk => { stdout += String(chunk); });
		child.stderr?.on('data', chunk => { stderr += String(chunk); });
		const timer = setTimeout(() => {
			child.kill('SIGTERM');
		}, timeoutMs);
		child.on('error', error => {
			clearTimeout(timer);
			resolve({ code: 1, stdout, stderr: `${stderr}\n${error instanceof Error ? error.message : String(error)}`.trim() });
		});
		child.on('close', code => {
			clearTimeout(timer);
			resolve({ code: code ?? 1, stdout, stderr });
		});
	});
}

function resolveWorkspacePath(workingDirectory: URI | undefined, pathArg: string, context: IOpenAIHostToolContext = {}): URI {
	return resolvePathAcrossWorkspaceRoots(workingDirectory, context.workspaceLinks ?? [], pathArg);
}

async function applyWorkspaceEdits(
	fileService: IFileService,
	workingDirectory: URI | undefined,
	args: Record<string, unknown>,
	context: IOpenAIHostToolContext,
): Promise<string> {
	if (context.autoApplyEdits !== true) {
		const { summary, edits } = parseWorkspaceEditsArg(args);
		return [
			'apply_workspace_edits is disabled until the user enables quantumide.ai.agent.autoApplyEdits.',
			`Proposed ${edits.length} edit(s)${summary ? ` — ${summary}` : ''}:`,
			...edits.map(edit => `- ${edit.operation} ${edit.path}${edit.operation !== 'delete' ? ` (${edit.content?.length ?? 0} chars)` : ''}`),
			'Use propose_file_edit for reviewable single-file changes, or ask the user to enable auto-apply for coordinated edits.',
		].join('\n');
	}
	const { summary, edits } = parseWorkspaceEditsArg(args);
	const indexGate = await getIndexingGateMessage(
		fileService,
		workingDirectory,
		context.waitForIndexingBeforeEdits === true,
	);
	if (indexGate) {
		return indexGate;
	}
	const editVelocity = resolveEffectiveEditVelocity(
		{ editVelocity: context.editVelocity ?? (context.fastApplyEdits ? 'fast' : 'safe') },
		edits.map(e => e.path),
	);
	const maxLines = context.directEditorMaxLines ?? 100;
	if (editVelocity !== 'maximum' && shouldPreferDirectEditorEdit(edits, maxLines, context.preferDirectEditorEdits !== false)) {
		const edit = edits[0];
		return [
			`Small single-file change (${edit.path}) — prefer client tools for speed:`,
			'- quantumide_show_inline_suggestion (inline accept/reject)',
			'- quantumide_manipulate_editor (cursor/selection insert/replace)',
			`Or re-call apply_workspace_edits to force full-file write (${edit.content?.length ?? 0} chars).`,
		].join('\n');
	}
	const maxEdits = context.maxEditScope && context.maxEditScope > 0 ? context.maxEditScope : undefined;
	const applyOptions = resolveApplyWorkspaceEditsOptions({
		editVelocity,
		editCount: edits.length,
		fastApplyEdits: context.fastApplyEdits,
		requireDeleteConfirmation: context.requireDeleteConfirmation,
		workingDirectory,
		workspaceLinks: context.workspaceLinks,
		workspacePolicies: context.workspacePolicies,
		maxEdits,
	});
	const result = await applyQuantumIDEWorkspaceEdits(fileService, workingDirectory, edits, applyOptions);
	if (result.applied.length > 0 && context.verifyOnEdit === 'defer' && workingDirectory) {
		await appendDeferredVerification(fileService, workingDirectory, 'compile', summary ?? 'apply_workspace_edits');
	}
	let formatted = formatApplyWorkspaceEditsResult(result, summary);
	if (result.applied.length > 0) {
		formatted = formatBatchApplySummary(summary, edits.length, result.applied) + '\n\n' + formatted;
		if (context.verifyOnEdit === 'defer') {
			formatted += '\n\nVerification deferred. User can run **QuantumIDE: Run Deferred Agent Verification**.';
		} else if (context.verifyOnEdit === 'never') {
			formatted += '\n\nAutomatic verification skipped (verifyOnEdit=never).';
		}
	}
	return formatted;
}

async function searchVectorWorkspace(
	fileService: IFileService,
	workingDirectory: URI | undefined,
	args: Record<string, unknown>,
	context: IOpenAIHostToolContext = {},
): Promise<string> {
	const query = typeof args.query === 'string' ? args.query.trim() : '';
	if (!query || !workingDirectory) {
		throw new Error('search_vector_workspace requires a query and workspace folder.');
	}
	const indexingOff = await discoveryFallbackWhenIndexingDisabled(fileService, workingDirectory, args, context, 'search_vector_workspace');
	if (indexingOff) {
		return indexingOff;
	}
	if (context.semanticIndexingEnabled === false) {
		const fallback = await searchWorkspaceText(fileService, workingDirectory, { query, maxResults: args.maxResults }, context);
		return formatQuantumIDEIndexingOffToolFallback('search_vector_workspace', fallback);
	}
	const maxResults = typeof args.maxResults === 'number' && args.maxResults > 0 ? Math.min(args.maxResults, 30) : 15;
	try {
		const incrementalHits = await loadIncrementalVectorSearch(fileService, workingDirectory, query, maxResults);
		if (incrementalHits.length > 0) {
			return `Vector matches for "${query}" (incremental store):\n\n${incrementalHits.map(hit => `- ${hit.path} (score ${hit.score.toFixed(3)})`).join('\n')}`;
		}
	} catch {
		// try json index
	}
	try {
		const lanceModule = await import('../../../quantumide/node/quantumideLanceVectorStore.js');
		const lanceHits = await lanceModule.searchLanceVectorStore(fileService, workingDirectory, query, maxResults);
		if (lanceHits.length > 0) {
			return `Vector matches for "${query}" (LanceDB):\n\n${lanceHits.map(hit => `- ${hit.path} (score ${hit.score.toFixed(3)})`).join('\n')}`;
		}
	} catch {
		// lance optional
	}
	try {
		const raw = (await fileService.readFile(joinPath(workingDirectory, QUANTUMIDE_VECTOR_INDEX_FILE))).value.toString();
		const index = parseVectorIndexJson(raw);
		if (!index) {
			return 'Vector index is invalid or empty. Reindex the workspace and retry.';
		}
		const hits = searchVectorIndex(index, query, maxResults);
		if (hits.length === 0) {
			const fallback = await searchWorkspaceText(fileService, workingDirectory, { query, maxResults }, {});
			return `No vector matches for "${query}" — automatic fallback (search_workspace_text):\n\n${fallback}`;
		}
		return `Vector matches for "${query}":\n\n${hits.map(hit => `- ${hit.path} (score ${hit.score.toFixed(3)})`).join('\n')}`;
	} catch {
		const fallback = await searchWorkspaceText(fileService, workingDirectory, { query, maxResults }, {});
		return `Vector index not found — automatic fallback (search_workspace_text):\n\n${fallback}`;
	}
}

async function searchWorkspaceComments(
	fileService: IFileService,
	workingDirectory: URI | undefined,
	args: Record<string, unknown>,
	context: IOpenAIHostToolContext = {},
): Promise<string> {
	const query = typeof args.query === 'string' ? args.query.trim() : '';
	if (!query || !workingDirectory) {
		throw new Error('search_workspace_comments requires a query and workspace folder.');
	}
	const indexingOff = await discoveryFallbackWhenIndexingDisabled(fileService, workingDirectory, args, context, 'search_workspace_comments');
	if (indexingOff) {
		return indexingOff;
	}
	const maxResults = typeof args.maxResults === 'number' && args.maxResults > 0 ? Math.min(args.maxResults, 30) : 15;
	try {
		const raw = (await fileService.readFile(joinPath(workingDirectory, QUANTUMIDE_COMMENTS_INDEX_FILE))).value.toString();
		const index = parseCommentsIndexJson(raw);
		if (!index) {
			return 'Comments index is invalid. Reindex the workspace.';
		}
		const hits = searchCommentsIndex(index, query, maxResults);
		if (hits.length === 0) {
			return `No comment matches for "${query}".`;
		}
		return `Comment matches for "${query}":\n\n${hits.map(h => `- ${h.path}:${h.line} [${h.kind}] ${h.text.slice(0, 120)}`).join('\n')}`;
	} catch {
		return 'Comments index not found. Reindex the workspace.';
	}
}

async function searchWorkspaceDiagnostics(
	fileService: IFileService,
	workingDirectory: URI | undefined,
	args: Record<string, unknown>,
	context: IOpenAIHostToolContext = {},
): Promise<string> {
	const query = typeof args.query === 'string' ? args.query.trim() : '';
	if (!workingDirectory) {
		throw new Error('search_workspace_diagnostics requires an open workspace folder.');
	}
	const indexingOff = await discoveryFallbackWhenIndexingDisabled(fileService, workingDirectory, args, context, 'search_workspace_diagnostics');
	if (indexingOff) {
		return indexingOff;
	}
	const maxResults = typeof args.maxResults === 'number' && args.maxResults > 0 ? Math.min(args.maxResults, 30) : 15;
	try {
		const raw = (await fileService.readFile(joinPath(workingDirectory, QUANTUMIDE_DIAGNOSTICS_INDEX_FILE))).value.toString();
		const index = parseDiagnosticsIndexJson(raw);
		if (!index) {
			return 'Diagnostics index is invalid. Reindex the workspace.';
		}
		const hits = searchDiagnosticsIndex(index, query, maxResults);
		if (hits.length === 0) {
			return query ? `No diagnostic matches for "${query}".` : 'No diagnostics in index.';
		}
		return `Diagnostic matches${query ? ` for "${query}"` : ''}:\n\n${hits.map(h => `- [${h.severity}] ${h.path}:${h.line} — ${h.message}${h.source ? ` (${h.source})` : ''}`).join('\n')}`;
	} catch {
		return 'Diagnostics index not found. Reindex the workspace.';
	}
}

async function queryDependencyGraph(
	fileService: IFileService,
	workingDirectory: URI | undefined,
	args: Record<string, unknown>,
	context: IOpenAIHostToolContext = {},
): Promise<string> {
	if (!workingDirectory) {
		throw new Error('query_dependency_graph requires an open workspace folder.');
	}
	const nodeQuery = typeof args.node === 'string' ? args.node.trim() : (typeof args.query === 'string' ? args.query.trim() : '');
	const indexingOff = await discoveryFallbackWhenIndexingDisabled(
		fileService,
		workingDirectory,
		{ query: nodeQuery, maxResults: args.maxResults },
		context,
		'query_dependency_graph',
	);
	if (indexingOff) {
		return indexingOff;
	}
	const maxNodes = typeof args.maxNodes === 'number' && args.maxNodes > 0 ? Math.min(args.maxNodes, 80) : 30;
	const nodeFilter = typeof args.node === 'string' ? args.node.trim().toLowerCase() : '';
	let graph: IQuantumIDEDependencyGraph | undefined;
	try {
		const raw = (await fileService.readFile(joinPath(workingDirectory, QUANTUMIDE_DEPENDENCY_GRAPH_FILE))).value.toString();
		graph = JSON.parse(raw) as IQuantumIDEDependencyGraph;
	} catch {
		return 'Dependency graph not found. Reindex the workspace.';
	}
	if (!graph?.nodes?.length) {
		return 'Dependency graph is empty.';
	}
	const nodes = nodeFilter
		? graph.nodes.filter(n => n.label.toLowerCase().includes(nodeFilter) || n.id.toLowerCase().includes(nodeFilter))
		: graph.nodes;
	return formatDependencyGraphSummary({ ...graph, nodes }, maxNodes);
}

async function refactorWorkspaceFile(
	fileService: IFileService,
	workingDirectory: URI | undefined,
	args: Record<string, unknown>,
	transform: (path: string, content: string) => { path: string; content: string },
	context: IOpenAIHostToolContext,
): Promise<string> {
	const pathArg = typeof args.path === 'string' ? args.path.trim() : '';
	if (!pathArg || !workingDirectory) {
		throw new Error('Refactor tool requires path and workspace folder.');
	}
	const resource = resolveWorkspacePath(workingDirectory, pathArg, context);
	const prior = (await fileService.readFile(resource)).value.toString();
	const next = transform(pathArg, prior);
	if (context.autoApplyEdits === true) {
		await assertQuantumIDEWorkspaceWritableForTool(
			fileService,
			workingDirectory,
			context.workspaceLinks,
			'refactor',
			context.workspaceReadonly,
		);
		const result = await applyQuantumIDEWorkspaceEdits(fileService, workingDirectory, [{ operation: 'write', path: pathArg, content: next.content }], {
			workingDirectory,
			workspaceLinks: context.workspaceLinks,
			atomic: true,
			validateSyntax: true,
			createCheckpoints: true,
		});
		return formatApplyWorkspaceEditsResult(result, `Refactored ${pathArg}`);
	}
	return `Proposed refactor for ${pathArg} (${next.content.length} chars). Enable auto-apply or use apply_workspace_patch to apply.`;
}

async function searchExternalRetrieval(args: Record<string, unknown>, context?: IOpenAIHostToolContext): Promise<string> {
	const query = typeof args.query === 'string' ? args.query.trim() : '';
	if (!query) {
		throw new Error('search_external_retrieval requires a query.');
	}
	if (shouldQuantumIDEBlockExternalIndexing(context?.privacyLocalIndexingOnly === true)) {
		return 'External retrieval is disabled (privacy: local indexing only).';
	}
	const maxResults = typeof args.maxResults === 'number' && args.maxResults > 0 ? Math.min(args.maxResults, 20) : 10;
	const rows: string[] = [];
	for (const plugin of getQuantumIDEPlugins()) {
		if (!plugin.retrievalProvider) {
			continue;
		}
		try {
			const external = await plugin.retrievalProvider.search(query, maxResults);
			for (const row of external) {
				rows.push(`- [${plugin.id}] ${row.path}: ${row.excerpt.slice(0, 200)}`);
			}
		} catch (err) {
			rows.push(`- [${plugin.id}] error: ${err instanceof Error ? err.message : String(err)}`);
		}
	}
	if (rows.length === 0) {
		return 'No external retrieval providers are registered. Use registerQuantumIDEPlugin with retrievalProvider.';
	}
	return `External retrieval for "${query}":\n\n${rows.slice(0, maxResults).join('\n')}`;
}

async function searchSemanticWorkspace(fileService: IFileService, workingDirectory: URI | undefined, args: Record<string, unknown>, context?: IOpenAIHostToolContext): Promise<string> {
	return runWithBudget('semanticRetrieval', QuantumIDEPerformanceBudgetMs.semanticRetrieval, async () => {
		markQuantumIDEPerformanceStart(QuantumIDEPerformanceMark.SemanticSearch);
		try {
			return await searchSemanticWorkspaceInner(fileService, workingDirectory, args, context);
		} finally {
			markQuantumIDEPerformanceEnd(QuantumIDEPerformanceMark.SemanticSearch);
		}
	});
}

async function searchSemanticWorkspaceInner(fileService: IFileService, workingDirectory: URI | undefined, args: Record<string, unknown>, context?: IOpenAIHostToolContext): Promise<string> {
	const semanticStart = Date.now();
	try {
	const query = typeof args.query === 'string' ? args.query.trim() : '';
	if (!query) {
		throw new Error('search_semantic_workspace requires a query.');
	}
	if (!workingDirectory) {
		throw new Error('search_semantic_workspace requires an open workspace folder.');
	}
	const indexingOff = await discoveryFallbackWhenIndexingDisabled(fileService, workingDirectory, args, context, 'search_semantic_workspace');
	if (indexingOff) {
		return indexingOff;
	}
	if (context?.semanticIndexingEnabled === false) {
		const maxResults = typeof args.maxResults === 'number' && args.maxResults > 0 ? Math.min(args.maxResults, 30) : 15;
		const fallback = await searchWorkspaceText(fileService, workingDirectory, { query, maxResults }, context ?? {});
		return formatQuantumIDEIndexingOffToolFallback('search_semantic_workspace', fallback);
	}
	const maxResults = typeof args.maxResults === 'number' && args.maxResults > 0 ? Math.min(args.maxResults, 30) : 15;
	const targetDirs = Array.isArray(args.target_directories)
		? args.target_directories.filter((d): d is string => typeof d === 'string' && d.trim().length > 0)
		: undefined;
	const status = await readQuantumIDEIndexingStatus(fileService, workingDirectory);
	if (status?.busy && !status.ready) {
		const pct = status.percent !== undefined ? ` (${status.percent}%)` : '';
		return `Workspace indexing in progress${pct}. Semantic search may be incomplete — retry after indexing completes or use search_workspace_text.`;
	}
	const { semantic: index, ast: astIndex } = await loadQuantumIDEPersistedSemanticIndexes(
		fileService,
		workingDirectory,
		readIndexPayload,
	);
	if (!index) {
		const fallback = await searchWorkspaceText(fileService, workingDirectory, { query, maxResults }, context ?? {});
		return `Semantic index not found — automatic fallback (search_workspace_text):\n\n${fallback}`;
	}
	let hits = searchSemanticIndex(index, query, maxResults * 3);
	if (targetDirs?.length) {
		hits = hits.filter(h => filterPathsByTargetDirectories([h.path], targetDirs).length > 0);
	}
	hits = hits.slice(0, maxResults);
	const astSymbols: IQuantumIDEAstSymbolEntry[] = [...(astIndex?.symbols ?? [])];
	for (const plugin of getQuantumIDEPlugins()) {
		if (!plugin.retrievalProvider || shouldQuantumIDEBlockExternalIndexing(context?.privacyLocalIndexingOnly === true)) {
			continue;
		}
		try {
			const external = await plugin.retrievalProvider.search(query, Math.min(maxResults, 10));
			for (const row of external) {
				hits.push({ path: row.path, score: 0.5 });
			}
		} catch {
			// skip plugin errors
		}
	}
	hits = hits.sort((a, b) => b.score - a.score).slice(0, maxResults);
	if (hits.length === 0) {
		const fallback = await searchWorkspaceText(fileService, workingDirectory, { query, maxResults }, context ?? {});
		return `No semantic matches for "${query}". Fallback text search:\n\n${fallback}`;
	}
	const lines = hits.map(hit => formatSemanticSearchHitLine(hit, astSymbols));
	return `Semantic matches for "${query}" (index v${index.version}, ${index.documents.length} docs):\n\n${lines.join('\n')}`;
	} finally {
		const semanticMs = Date.now() - semanticStart;
		recordQuantumIDESemanticSearchLatency(semanticMs);
		console.info(formatQuantumIDEWorkspaceDiscoveryLog({
			component: 'agent-search',
			operation: 'semantic',
			durationMs: semanticMs,
		}));
	}
}

async function lookupTypeHierarchy(fileService: IFileService, workingDirectory: URI | undefined, args: Record<string, unknown>): Promise<string> {
	const typeName = typeof args.typeName === 'string' ? args.typeName : '';
	if (!typeName || !workingDirectory) {
		throw new Error('lookup_type_hierarchy requires typeName and workspace.');
	}
	const astFile = joinPath(workingDirectory, QUANTUMIDE_AST_INDEX_FILE);
	let symbols;
	try {
		const raw = (await fileService.readFile(astFile)).value.toString();
		const parsed = JSON.parse(raw) as { symbols?: { path: string; line: number; kind: string; name: string }[] };
		symbols = parsed.symbols ?? [];
	} catch {
		return 'AST index not found. Reindex the workspace first.';
	}
	const node = buildTypeHierarchy(symbols, typeName);
	return node ? formatTypeHierarchy(node) : `No hierarchy found for "${typeName}".`;
}

async function searchArchitecturalPatternsTool(fileService: IFileService, workingDirectory: URI | undefined, args: Record<string, unknown>): Promise<string> {
	const pattern = args.pattern as QuantumIDEArchitecturePattern;
	if (!pattern || !workingDirectory) {
		throw new Error('search_architectural_patterns requires pattern and workspace.');
	}
	const indexFile = joinPath(workingDirectory, QUANTUMIDE_SEMANTIC_INDEX_FILE);
	const raw = (await fileService.readFile(indexFile)).value.toString();
	const index = parseSemanticIndexJson(raw);
	if (!index) {
		return 'Semantic index not found. Reindex first.';
	}
	const hits = searchArchitecturalPatterns(index, pattern, typeof args.maxResults === 'number' ? args.maxResults : 15);
	return hits.length ? `Pattern "${pattern}":\n${hits.map(h => `- ${h.path} (${h.score.toFixed(2)})`).join('\n')}` : `No matches for pattern "${pattern}".`;
}

async function renameSymbolTool(fileService: IFileService, workingDirectory: URI | undefined, args: Record<string, unknown>, context: IOpenAIHostToolContext): Promise<string> {
	const pathArg = typeof args.path === 'string' ? args.path.trim() : '';
	const oldName = typeof args.oldName === 'string' ? args.oldName.trim() : '';
	const newName = typeof args.newName === 'string' ? args.newName.trim() : '';
	const workspaceWide = args.workspaceWide === true;
	if (!pathArg || !oldName || !newName) {
		throw new Error('rename_symbol requires path, oldName, and newName.');
	}
	if (workspaceWide || context.preferLspRename !== false) {
		return [
			`Workspace-wide rename requested for "${oldName}" → "${newName}" in ${pathArg}.`,
			'Use the client `rename` tool (vscode_renameSymbol) or `quantumide_lsp_workspace_rename` at the symbol location for LSP-accurate cross-file renames.',
			'The client rename flow opens a preview and stages per-file pending edits so each change can be accepted/rejected before apply.',
			'Do not use rename_symbol when workspaceWide is true or preferLspRename is enabled.',
		].join('\n');
	}
	const resource = resolveWorkspacePath(workingDirectory, pathArg, context);
	const content = (await fileService.readFile(resource)).value.toString();
	const result = renameSymbolInFile(pathArg, content, oldName, newName);
	if (context.autoApplyEdits) {
		await applyQuantumIDEWorkspaceEdits(fileService, workingDirectory, [
			{ operation: 'write', path: result.path, content: result.content },
		], { workingDirectory, atomic: true, validateSyntax: true, policies: context.workspacePolicies });
		return `Renamed ${oldName} → ${newName} in ${pathArg}.`;
	}
	return `Proposed rename ${oldName} → ${newName} in ${pathArg}. Enable auto-apply or use apply_workspace_edits.`;
}

function detectEditConflictsTool(args: Record<string, unknown>): string {
	const { edits } = parseWorkspaceEditsArg(args);
	const conflicts = detectEditConflicts(edits);
	if (conflicts.length === 0) {
		return `No conflicts in ${edits.length} proposed edit(s).`;
	}
	return `Conflicts:\n${conflicts.map(c => `- ${c.path}: ${c.reason}`).join('\n')}`;
}

async function suggestDependentFilesTool(fileService: IFileService, workingDirectory: URI | undefined, args: Record<string, unknown>): Promise<string> {
	const pathArg = typeof args.path === 'string' ? args.path.trim() : '';
	if (!pathArg || !workingDirectory) {
		throw new Error('suggest_dependent_files requires path.');
	}
	let graph;
	try {
		const raw = (await fileService.readFile(joinPath(workingDirectory, QUANTUMIDE_DEPENDENCY_GRAPH_FILE))).value.toString();
		graph = JSON.parse(raw);
	} catch {
		return 'Dependency graph not available. Reindex the workspace.';
	}
	const suggestions = suggestDependentPaths(graph, pathArg);
	return suggestions.length ? `Dependent files to review:\n${suggestions.map(s => `- ${s}`).join('\n')}` : 'No dependent files suggested.';
}

async function extractComponentTool(fileService: IFileService, workingDirectory: URI | undefined, args: Record<string, unknown>, context: IOpenAIHostToolContext): Promise<string> {
	const pathArg = typeof args.path === 'string' ? args.path.trim() : '';
	const targetPath = typeof args.targetPath === 'string' ? args.targetPath.trim() : '';
	const componentName = typeof args.componentName === 'string' ? args.componentName.trim() : '';
	const startLine = typeof args.startLine === 'number' ? args.startLine : 0;
	const endLine = typeof args.endLine === 'number' ? args.endLine : 0;
	if (!pathArg || !targetPath || !componentName) {
		throw new Error('extract_component requires path, targetPath, componentName, startLine, endLine.');
	}
	const resource = resolveWorkspacePath(workingDirectory, pathArg, context);
	const content = (await fileService.readFile(resource)).value.toString();
	const result = extractComponentInFile(pathArg, content, componentName, startLine, endLine, targetPath);
	if (context.autoApplyEdits) {
		await applyQuantumIDEWorkspaceEdits(fileService, workingDirectory, [
			{ operation: 'write', path: result.source.path, content: result.source.content },
			{ operation: 'create', path: result.component.path, content: result.component.content },
		], { workingDirectory, atomic: true, validateSyntax: true, createCheckpoints: true });
		return `Extracted ${componentName} to ${targetPath} and updated ${pathArg}.`;
	}
	return `Proposed extract_component: update ${pathArg} and create ${targetPath}.`;
}

async function moveModuleTool(fileService: IFileService, workingDirectory: URI | undefined, args: Record<string, unknown>, context: IOpenAIHostToolContext): Promise<string> {
	const fromPath = typeof args.fromPath === 'string' ? args.fromPath.trim() : '';
	const toPath = typeof args.toPath === 'string' ? args.toPath.trim() : '';
	if (!fromPath || !toPath || !workingDirectory) {
		throw new Error('move_module requires fromPath and toPath.');
	}
	const fromRes = resolveWorkspacePath(workingDirectory, fromPath, context);
	const content = moveModuleContent((await fileService.readFile(fromRes)).value.toString(), fromPath, toPath);
	if (context.autoApplyEdits) {
		await applyQuantumIDEWorkspaceEdits(fileService, workingDirectory, [
			{ operation: 'write', path: toPath, content },
			{ operation: 'delete', path: fromPath },
		], { workingDirectory, atomic: true, createCheckpoints: true });
		return `Moved ${fromPath} → ${toPath}.`;
	}
	return `Proposed move ${fromPath} → ${toPath} (${content.length} chars).`;
}

async function generateTestScaffoldTool(fileService: IFileService, workingDirectory: URI | undefined, args: Record<string, unknown>, context: IOpenAIHostToolContext): Promise<string> {
	const sourcePath = typeof args.sourcePath === 'string' ? args.sourcePath.trim() : '';
	if (!sourcePath) {
		throw new Error('generate_test_scaffold requires sourcePath.');
	}
	const scaffold = generateTestScaffold(sourcePath, typeof args.exportName === 'string' ? args.exportName : undefined);
	if (context.autoApplyEdits) {
		await applyQuantumIDEWorkspaceEdits(fileService, workingDirectory, [{ operation: 'create', path: scaffold.path, content: scaffold.content }], { workingDirectory, atomic: true, validateSyntax: true });
		return `Created test scaffold at ${scaffold.path}.`;
	}
	return `Proposed test file ${scaffold.path} (${scaffold.content.length} chars).`;
}

async function updatePackageDependencyTool(fileService: IFileService, workingDirectory: URI | undefined, args: Record<string, unknown>, context: IOpenAIHostToolContext): Promise<string> {
	const packageName = typeof args.packageName === 'string' ? args.packageName.trim() : '';
	const version = typeof args.version === 'string' ? args.version.trim() : '';
	if (!packageName || !version || !workingDirectory) {
		throw new Error('update_package_dependency requires packageName and version.');
	}
	const pkgPath = 'package.json';
	const resource = joinPath(workingDirectory, pkgPath);
	const content = updatePackageDependency((await fileService.readFile(resource)).value.toString(), packageName, version);
	if (context.autoApplyEdits) {
		await applyQuantumIDEWorkspaceEdits(fileService, workingDirectory, [{ operation: 'write', path: pkgPath, content }], { workingDirectory, atomic: true });
		return `Updated ${packageName} to ${version} in package.json.`;
	}
	return `Proposed ${packageName}@${version} in package.json.`;
}

async function scanDirectory(
	fileService: IFileService,
	resource: URI,
	visitor: (resource: URI) => Promise<void>,
	policy?: IQuantumIDEWorkspaceIgnorePolicy,
	roots?: readonly URI[],
): Promise<void> {
	let stat;
	try {
		stat = await fileService.stat(resource);
	} catch {
		return;
	}
	if (!stat.isDirectory) {
		if (policy && roots?.length) {
			const rel = relativePathInWorkspaceRoots(resource, roots);
			if (rel && isQuantumIDEPathIgnored(rel, policy, 'ai')) {
				return;
			}
		}
		await visitor(resource);
		return;
	}
	let children;
	try {
		children = await fileService.resolve(resource);
	} catch {
		return;
	}
	for (const child of children.children ?? []) {
		if (child.name.startsWith('.') || child.name === 'node_modules' || child.name === 'out' || child.name === 'dist') {
			continue;
		}
		if (policy && roots?.length) {
			const rel = relativePathInWorkspaceRoots(child.resource, roots);
			if (rel && isQuantumIDEPathIgnored(rel, policy, 'ai', child.name)) {
				continue;
			}
		}
		await scanDirectory(fileService, child.resource, visitor, policy, roots);
	}
}

async function listWorkspaceFolders(workingDirectory: URI | undefined, context: IOpenAIHostToolContext): Promise<string> {
	return formatWorkspaceRootsForAgent(workingDirectory, context.workspaceLinks ?? []);
}

async function getProjectManifests(fileService: IFileService, workingDirectory: URI | undefined, args: Record<string, unknown>): Promise<string> {
	if (!workingDirectory) {
		throw new Error('get_project_manifests requires an open workspace folder.');
	}
	const maxManifests = typeof args.maxManifests === 'number' && args.maxManifests > 0 ? Math.min(args.maxManifests, 24) : 12;
	const summaries: ReturnType<typeof parseProjectManifestSummary>[] = [];
	await scanDirectory(fileService, workingDirectory, async resource => {
		if (summaries.length >= maxManifests) {
			return;
		}
		const name = resource.path.split('/').pop() ?? '';
		const kind = detectQuantumIDEManifestKind(name);
		if (!kind || !QuantumIDEManifestNames.has(name)) {
			return;
		}
		const rel = resource.path.startsWith(workingDirectory.fsPath)
			? resource.path.slice(workingDirectory.fsPath.length + 1)
			: resource.path;
		try {
			const content = (await fileService.readFile(resource)).value.toString();
			summaries.push(parseProjectManifestSummary(kind, rel, content));
		} catch {
			// skip unreadable manifests
		}
	});
	return formatProjectManifestSummaries(summaries);
}

async function discoverWorkspaceTests(fileService: IFileService, workingDirectory: URI | undefined): Promise<string> {
	if (!workingDirectory) {
		throw new Error('discover_workspace_tests requires an open workspace folder.');
	}
	const filePaths: string[] = [];
	let packageScripts: Record<string, string> | undefined;
	await scanDirectory(fileService, workingDirectory, async resource => {
		const name = resource.path.split('/').pop() ?? '';
		const rel = resource.path.startsWith(workingDirectory.fsPath)
			? resource.path.slice(workingDirectory.fsPath.length + 1)
			: resource.path;
		if (name === 'package.json' && !packageScripts) {
			try {
				const json = JSON.parse((await fileService.readFile(resource)).value.toString()) as Record<string, unknown>;
				if (json.scripts && typeof json.scripts === 'object') {
					packageScripts = Object.fromEntries(
						Object.entries(json.scripts as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === 'string'),
					);
				}
			} catch {
				// ignore
			}
		}
		filePaths.push(rel);
	});
	const result = discoverTestsFromWorkspaceFiles(filePaths, packageScripts);
	return formatDiscoveredTests(result);
}

async function formatWorkspace(workingDirectory: URI | undefined, args: Record<string, unknown>, fileService: IFileService, context: IOpenAIHostToolContext = {}): Promise<string> {
	const action = typeof args.action === 'string' ? args.action : 'format';
	const pathArg = typeof args.path === 'string' ? args.path.trim() : '';
	if (action === 'lint') {
		return runWorkspaceCheck(workingDirectory, { check: 'lint' }, fileService);
	}
	const cwd = workingDirectory?.fsPath ?? process.cwd();
	if (pathArg && workingDirectory) {
		const resource = resolveWorkspacePath(workingDirectory, pathArg, context);
		const { code, stdout, stderr } = await runShellCommand('npx', ['prettier', '--write', resource.fsPath], cwd, 120_000);
		const out = (stdout + stderr).slice(-8000);
		return code === 0 ? `Formatted ${pathArg}.\n${out}` : `Format failed (exit ${code}).\n${out}`;
	}
	const taskCommand = await resolveTaskCommand(workingDirectory, 'format', fileService);
	if (taskCommand) {
		const { code, stdout, stderr } = await runShellCommand(taskCommand.command, taskCommand.cmdArgs, cwd, VERIFY_TIMEOUT_MS);
		const out = (stdout + stderr).slice(-MAX_VERIFY_OUTPUT_CHARS);
		return code === 0 ? `Format succeeded.\n${out}` : `Format failed (exit ${code}).\n${out}`;
	}
	const { code, stdout, stderr } = await runShellCommand('npm', ['run', 'format'], cwd, VERIFY_TIMEOUT_MS);
	if (code !== 0) {
		const prettier = await runShellCommand('npx', ['prettier', '--write', '.'], cwd, VERIFY_TIMEOUT_MS);
		const out = (prettier.stdout + prettier.stderr).slice(-MAX_VERIFY_OUTPUT_CHARS);
		return prettier.code === 0 ? `Formatted with prettier.\n${out}` : `Format failed.\n${out}`;
	}
	return `Format succeeded.\n${(stdout + stderr).slice(-MAX_VERIFY_OUTPUT_CHARS)}`;
}

async function searchCodeWithPreview(
	fileService: IFileService,
	workingDirectory: URI | undefined,
	args: Record<string, unknown>,
	context?: IOpenAIHostToolContext,
): Promise<string> {
	const query = typeof args.query === 'string' ? args.query.trim() : '';
	if (!query || !workingDirectory) {
		throw new Error('search_code_with_preview requires query and workspace.');
	}
	const maxResults = typeof args.maxResults === 'number' && args.maxResults > 0 ? Math.min(args.maxResults, 12) : 8;
	const semantic = await searchSemanticWorkspace(fileService, workingDirectory, { query, maxResults }, context);
	const symbol = await searchWorkspaceSymbols(fileService, workingDirectory, query, maxResults);
	const paths = new Set<string>();
	for (const line of `${semantic}\n${symbol}`.split('\n')) {
		const match = line.match(/^-\s+([^\s(]+)/);
		if (match?.[1]) {
			paths.add(match[1]);
		}
	}
	const previews: string[] = [`Search: "${query}"`, '', '--- Semantic / symbol hits ---', semantic, '', '--- Symbol index ---', symbol, '', '--- Code previews ---'];
	let count = 0;
	for (const path of paths) {
		if (count >= maxResults) {
			break;
		}
		try {
			const excerpt = await readWorkspaceFile(fileService, workingDirectory, { path, maxChars: 1200, startLine: 1, endLine: 40 }, context ?? {});
			previews.push(`\n### ${path}\n\`\`\`\n${excerpt}\n\`\`\``);
			count++;
		} catch {
			// skip
		}
	}
	return previews.join('\n');
}

async function searchWorkspaceDocumentation(fileService: IFileService, workingDirectory: URI | undefined, args: Record<string, unknown>): Promise<string> {
	const query = typeof args.query === 'string' ? args.query.trim() : '';
	if (!query || !workingDirectory) {
		throw new Error('search_workspace_documentation requires query and workspace.');
	}
	const maxResults = typeof args.maxResults === 'number' && args.maxResults > 0 ? Math.min(args.maxResults, 20) : 15;
	const commentHits = await searchWorkspaceComments(fileService, workingDirectory, { query, maxResults });
	const rows: string[] = [commentHits, '', 'README / markdown matches:'];
	let found = 0;
	await scanDirectory(fileService, workingDirectory, async resource => {
		if (found >= maxResults) {
			return;
		}
		const name = resource.path.split('/').pop() ?? '';
		if (!/^(readme|contributing|docs?)/i.test(name) && !name.endsWith('.md')) {
			return;
		}
		try {
			const text = (await fileService.readFile(resource)).value.toString();
			if (!text.toLowerCase().includes(query.toLowerCase())) {
				return;
			}
			const rel = resource.path.startsWith(workingDirectory.fsPath)
				? resource.path.slice(workingDirectory.fsPath.length + 1)
				: resource.path;
			const idx = text.toLowerCase().indexOf(query.toLowerCase());
			const start = Math.max(0, idx - 80);
			rows.push(`- ${rel}: ...${text.slice(start, start + 200).replace(/\s+/g, ' ')}...`);
			found++;
		} catch {
			// skip
		}
	});
	if (found === 0) {
		rows.push('- No markdown/README matches.');
	}
	return rows.join('\n');
}
