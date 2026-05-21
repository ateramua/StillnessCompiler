/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { spawn } from 'child_process';
import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import type { IFileService } from '../../../files/common/files.js';
import {
	buildDependencyCommand,
	detectPackageManager,
	formatDependencyResult,
	type QuantumIDEDependencyAction,
} from '../../../quantumide/common/quantumideDependencyManager.js';
import {
	buildGitCommand,
	formatGitOperationResult,
	type QuantumIDEGitOperation,
} from '../../../quantumide/common/quantumideGitOperations.js';
import {
	buildCodeReviewReport,
	formatCodeReviewReport,
} from '../../../quantumide/common/quantumideCodeReviewAnalyzer.js';
import {
	expandContextFromSymbols,
	formatContextExpansion,
} from '../../../quantumide/common/quantumideContextExpansion.js';
import {
	formatFrameworkWorkflowResult,
	runFrameworkWorkflow,
	type QuantumIDEFrameworkWorkflowAction,
} from '../../../quantumide/common/quantumideFrameworkWorkflows.js';
import {
	buildProjectScaffold,
	detectScaffoldKindFromPrompt,
	formatScaffoldPlan,
	type QuantumIDEProjectScaffoldKind,
} from '../../../quantumide/common/quantumideProjectScaffold.js';
import {
	appendReplHistory,
	buildReplCommand,
	createReplSession,
	formatReplOutput,
	type IQuantumIDEReplSessionState,
} from '../../../quantumide/common/quantumideReplSession.js';
import {
	applyQuantumIDEWorkspaceEdits,
	formatApplyWorkspaceEditsResult,
} from '../../../quantumide/common/quantumideWorkspaceEdits.js';
import {
	QUANTUMIDE_AST_INDEX_FILE,
	parseAstIndexJson,
} from '../../../quantumide/common/quantumideSemanticIndex.js';
import type { IOpenAIToolDefinition } from './openAiClient.js';
import type { IOpenAIHostToolContext } from './openaiHostTools.js';

const replSessions = new Map<string, IQuantumIDEReplSessionState>();

export const QUANTUMIDE_HOST_WORKFLOW_TOOLS: readonly IOpenAIToolDefinition[] = [
	{
		type: 'function',
		function: {
			name: 'scaffold_project',
			description: 'Generate a new project scaffold (Next.js, React+Vite, Express+TS, Django, TS library) or add TypeScript support. Returns files for review before apply_workspace_edits.',
			parameters: {
				type: 'object',
				properties: {
					kind: { type: 'string', enum: ['nextjs', 'react-vite', 'express-ts', 'django', 'typescript-lib', 'add-typescript'] },
					projectName: { type: 'string' },
					prompt: { type: 'string', description: 'Natural language prompt to auto-detect kind.' },
					apply: { type: 'boolean', description: 'Apply files immediately (default false = preview only).' },
				},
				additionalProperties: false,
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'run_repl_snippet',
			description: 'Run a code snippet in a REPL-like session (python, node, shell). Preserves session history when sessionId is reused.',
			parameters: {
				type: 'object',
				properties: {
					code: { type: 'string' },
					language: { type: 'string' },
					sessionId: { type: 'string' },
				},
				required: ['code'],
				additionalProperties: false,
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'expand_query_context',
			description: 'Auto-expand context by loading related files, definitions, and usages for a query/symbol.',
			parameters: {
				type: 'object',
				properties: {
					query: { type: 'string' },
					maxHits: { type: 'number' },
				},
				required: ['query'],
				additionalProperties: false,
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'analyze_code_review',
			description: 'Analyze files for code review findings (security, style, maintainability) with severity levels.',
			parameters: {
				type: 'object',
				properties: {
					paths: { type: 'array', items: { type: 'string' } },
				},
				required: ['paths'],
				additionalProperties: false,
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'run_framework_workflow',
			description: 'Run a framework-specific workflow: add React component, Next.js API route, Django model, or Express route.',
			parameters: {
				type: 'object',
				properties: {
					action: { type: 'string', enum: ['add_react_component', 'add_next_api_route', 'add_django_model', 'add_express_route'] },
					name: { type: 'string' },
					route: { type: 'string' },
					fields: { type: 'object', additionalProperties: { type: 'string' } },
					apply: { type: 'boolean' },
				},
				required: ['action', 'name'],
				additionalProperties: false,
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'run_git_operation',
			description: 'Run git operations: status, diff, stage, commit, branch, checkout, push, pull, log. Write operations require confirmation unless autoApplyEdits is enabled.',
			parameters: {
				type: 'object',
				properties: {
					operation: { type: 'string', enum: ['status', 'diff', 'stage_all', 'stage', 'unstage', 'commit', 'branch', 'checkout', 'push', 'pull', 'log'] },
					message: { type: 'string' },
					branch: { type: 'string' },
					paths: { type: 'array', items: { type: 'string' } },
					remote: { type: 'string' },
				},
				required: ['operation'],
				additionalProperties: false,
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'manage_dependency',
			description: 'Install, add, remove, upgrade, audit, or list dependencies via npm/pnpm/yarn.',
			parameters: {
				type: 'object',
				properties: {
					action: { type: 'string', enum: ['install', 'add', 'remove', 'upgrade', 'audit', 'list'] },
					packageName: { type: 'string' },
					version: { type: 'string' },
					dev: { type: 'boolean' },
					manager: { type: 'string', enum: ['npm', 'pnpm', 'yarn'] },
					confirm: { type: 'boolean', description: 'Required true for network/modifying operations unless autoApplyEdits.' },
				},
				required: ['action'],
				additionalProperties: false,
			},
		},
	},
];

export async function executeQuantumIDEHostWorkflowTool(
	fileService: IFileService,
	workingDirectory: URI | undefined,
	toolName: string,
	args: Record<string, unknown>,
	context: IOpenAIHostToolContext = {},
): Promise<string> {
	switch (toolName) {
		case 'scaffold_project':
			return scaffoldProject(fileService, workingDirectory, args, context);
		case 'run_repl_snippet':
			return runReplSnippet(workingDirectory, args);
		case 'expand_query_context':
			return expandQueryContext(fileService, workingDirectory, args);
		case 'analyze_code_review':
			return analyzeCodeReview(fileService, workingDirectory, args);
		case 'run_framework_workflow':
			return runFrameworkWorkflowTool(fileService, workingDirectory, args, context);
		case 'run_git_operation':
			return runGitOperation(workingDirectory, args, context);
		case 'manage_dependency':
			return manageDependency(fileService, workingDirectory, args, context);
		default:
			throw new Error(`Unknown workflow tool: ${toolName}`);
	}
}

async function scaffoldProject(
	fileService: IFileService,
	workingDirectory: URI | undefined,
	args: Record<string, unknown>,
	context: IOpenAIHostToolContext,
): Promise<string> {
	if (!workingDirectory) {
		throw new Error('scaffold_project requires an open workspace folder.');
	}
	const prompt = typeof args.prompt === 'string' ? args.prompt : '';
	let kind = typeof args.kind === 'string' ? args.kind as QuantumIDEProjectScaffoldKind : detectScaffoldKindFromPrompt(prompt);
	if (!kind) {
		kind = 'react-vite';
	}
	const projectName = typeof args.projectName === 'string' ? args.projectName : 'my-app';
	const plan = buildProjectScaffold(kind, projectName);
	const preview = formatScaffoldPlan(plan);
	if (args.apply !== true && context.autoApplyEdits !== true) {
		return `${preview}\n\nApply with scaffold_project(apply=true) or apply_workspace_edits.`;
	}
	const edits = plan.files.map(f => ({ operation: 'create' as const, path: f.path, content: f.content }));
	const result = await applyQuantumIDEWorkspaceEdits(fileService, workingDirectory, edits, { workingDirectory, atomic: true, validateSyntax: true });
	let body = formatApplyWorkspaceEditsResult(result);
	if (plan.postInstallCommands.length > 0) {
		body += `\n\nNext steps:\n${plan.postInstallCommands.map(c => `- ${c}`).join('\n')}`;
	}
	return body;
}

async function runReplSnippet(workingDirectory: URI | undefined, args: Record<string, unknown>): Promise<string> {
	const code = typeof args.code === 'string' ? args.code : '';
	if (!code.trim()) {
		throw new Error('run_repl_snippet requires code.');
	}
	const language = typeof args.language === 'string' ? args.language : 'javascript';
	const sessionId = typeof args.sessionId === 'string' ? args.sessionId : undefined;
	let session = sessionId ? replSessions.get(sessionId) : undefined;
	if (!session) {
		session = createReplSession(language, sessionId);
		replSessions.set(session.sessionId, session);
	}
	const command = buildReplCommand(session, code);
	const cwd = workingDirectory?.fsPath ?? process.cwd();
	const { code: exitCode, stdout, stderr } = await runShellForRepl(command, cwd, 30_000);
	const output = stdout.trim() || stderr.trim() || '(no output)';
	const updated = appendReplHistory(session, code, output);
	replSessions.set(updated.sessionId, updated);
	return formatReplOutput({ output: stdout, stderr, success: exitCode === 0, command }, updated)
		+ `\n\nsessionId: ${updated.sessionId}`;
}

async function expandQueryContext(fileService: IFileService, workingDirectory: URI | undefined, args: Record<string, unknown>): Promise<string> {
	const query = typeof args.query === 'string' ? args.query.trim() : '';
	if (!query || !workingDirectory) {
		throw new Error('expand_query_context requires query and workspace.');
	}
	const maxHits = typeof args.maxHits === 'number' ? args.maxHits : 10;
	let symbols: { path: string; name: string; kind: string; line: number }[] = [];
	try {
		const raw = (await fileService.readFile(joinPath(workingDirectory, QUANTUMIDE_AST_INDEX_FILE))).value.toString();
		const index = parseAstIndexJson(raw);
		if (index) {
			symbols = index.symbols.map(s => ({ path: s.path, name: s.name, kind: s.kind, line: s.line }));
		}
	} catch {
		// no index
	}
	const fileContents = new Map<string, string>();
	const terms = query.toLowerCase().split(/\W+/).filter(t => t.length > 2);
	const topPaths = [...new Set(symbols.filter(s => terms.some(t => s.name.toLowerCase().includes(t) || s.path.toLowerCase().includes(t))).map(s => s.path))].slice(0, maxHits);
	for (const path of topPaths) {
		try {
			const content = (await fileService.readFile(joinPath(workingDirectory, path))).value.toString();
			fileContents.set(path, content);
		} catch {
			// skip
		}
	}
	return formatContextExpansion(expandContextFromSymbols(query, symbols, fileContents, maxHits));
}

async function analyzeCodeReview(fileService: IFileService, workingDirectory: URI | undefined, args: Record<string, unknown>): Promise<string> {
	if (!workingDirectory) {
		throw new Error('analyze_code_review requires workspace.');
	}
	const paths = Array.isArray(args.paths) ? args.paths.filter((p): p is string => typeof p === 'string') : [];
	if (paths.length === 0) {
		throw new Error('analyze_code_review requires paths array.');
	}
	const files: { path: string; content: string }[] = [];
	for (const path of paths.slice(0, 20)) {
		try {
			const content = (await fileService.readFile(joinPath(workingDirectory, path))).value.toString();
			files.push({ path, content });
		} catch {
			// skip
		}
	}
	return formatCodeReviewReport(buildCodeReviewReport(files));
}

async function runFrameworkWorkflowTool(
	fileService: IFileService,
	workingDirectory: URI | undefined,
	args: Record<string, unknown>,
	context: IOpenAIHostToolContext,
): Promise<string> {
	const action = typeof args.action === 'string' ? args.action as QuantumIDEFrameworkWorkflowAction : 'add_react_component';
	const name = typeof args.name === 'string' ? args.name : 'Component';
	const result = runFrameworkWorkflow(action, {
		name,
		route: typeof args.route === 'string' ? args.route : undefined,
		fields: args.fields as Record<string, string> | undefined,
	});
	const preview = formatFrameworkWorkflowResult(result);
	if (args.apply !== true && context.autoApplyEdits !== true) {
		return `${preview}\n\nApply with run_framework_workflow(apply=true) or apply_workspace_edits.`;
	}
	if (!workingDirectory) {
		throw new Error('run_framework_workflow apply requires workspace.');
	}
	const edits = result.edits.map(e => ({ operation: (e.operation === 'append' ? 'write' : e.operation) as 'create' | 'write', path: e.path, content: e.content }));
	const applyResult = await applyQuantumIDEWorkspaceEdits(fileService, workingDirectory, edits, { workingDirectory, atomic: true, validateSyntax: true });
	return `${preview}\n\n${formatApplyWorkspaceEditsResult(applyResult)}`;
}

async function runGitOperation(workingDirectory: URI | undefined, args: Record<string, unknown>, context: IOpenAIHostToolContext): Promise<string> {
	if (!workingDirectory) {
		throw new Error('run_git_operation requires workspace.');
	}
	const operation = typeof args.operation === 'string' ? args.operation as QuantumIDEGitOperation : 'status';
	const spec = buildGitCommand(operation, {
		message: typeof args.message === 'string' ? args.message : undefined,
		branch: typeof args.branch === 'string' ? args.branch : undefined,
		paths: Array.isArray(args.paths) ? args.paths.filter((p): p is string => typeof p === 'string') : undefined,
		remote: typeof args.remote === 'string' ? args.remote : undefined,
	});
	if (spec.requiresWrite && context.autoApplyEdits !== true) {
		return `Git ${operation} requires confirmation. Re-run after user approval.\nCommand: git ${spec.args.join(' ')}`;
	}
	const { code, stdout, stderr } = await runShellForRepl(`git ${spec.args.join(' ')}`, workingDirectory.fsPath, 120_000);
	return formatGitOperationResult({ operation, success: code === 0, stdout, stderr, exitCode: code });
}

async function manageDependency(
	fileService: IFileService,
	workingDirectory: URI | undefined,
	args: Record<string, unknown>,
	context: IOpenAIHostToolContext,
): Promise<string> {
	if (!workingDirectory) {
		throw new Error('manage_dependency requires workspace.');
	}
	const action = typeof args.action === 'string' ? args.action as QuantumIDEDependencyAction : 'list';
	const manager = typeof args.manager === 'string'
		? args.manager as 'npm' | 'pnpm' | 'yarn'
		: detectPackageManager(await listLockFiles(fileService, workingDirectory));
	const spec = buildDependencyCommand(action, manager, {
		packageName: typeof args.packageName === 'string' ? args.packageName : undefined,
		version: typeof args.version === 'string' ? args.version : undefined,
		dev: args.dev === true,
	});
	if ((spec.requiresNetwork || spec.modifiesLockfile) && args.confirm !== true && context.autoApplyEdits !== true) {
		return `Dependency ${action} requires confirm=true.\nCommand: ${spec.command} ${spec.args.join(' ')}`;
	}
	const { code, stdout, stderr } = await runShellForRepl(`${spec.command} ${spec.args.join(' ')}`, workingDirectory.fsPath, 300_000);
	return formatDependencyResult({
		action,
		packageName: typeof args.packageName === 'string' ? args.packageName : undefined,
		success: code === 0,
		stdout,
		stderr,
		exitCode: code,
	});
}

async function listLockFiles(fileService: IFileService, root: URI): Promise<string[]> {
	const names = ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'package.json'];
	const found: string[] = [];
	for (const name of names) {
		try {
			await fileService.stat(joinPath(root, name));
			found.push(name);
		} catch {
			// skip
		}
	}
	return found;
}

function runShellForRepl(commandLine: string, cwd: string, timeoutMs: number): Promise<{ code: number; stdout: string; stderr: string }> {
	return new Promise(resolve => {
		const child = spawn(commandLine, { cwd, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
		let stdout = '';
		let stderr = '';
		child.stdout?.on('data', d => { stdout += String(d); });
		child.stderr?.on('data', d => { stderr += String(d); });
		const timer = setTimeout(() => {
			child.kill();
			resolve({ code: -1, stdout, stderr: stderr + '\n(timed out)' });
		}, timeoutMs);
		child.on('close', code => {
			clearTimeout(timer);
			resolve({ code: code ?? -1, stdout, stderr });
		});
	});
}
