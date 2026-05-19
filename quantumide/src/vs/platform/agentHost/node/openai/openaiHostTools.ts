/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import type { IFileService } from '../../../files/common/files.js';
import type { IOpenAIToolDefinition } from './openAiClient.js';

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
			name: 'read_workspace_file',
			description: 'Read the contents of a workspace file by relative or absolute path.',
			parameters: {
				type: 'object',
				properties: {
					path: { type: 'string', description: 'Workspace-relative or absolute file path.' },
					maxChars: { type: 'number', description: 'Maximum characters to return (default 12000).' },
				},
				required: ['path'],
				additionalProperties: false,
			},
		},
	},
];

const DEFAULT_MAX_SEARCH_RESULTS = 20;
const DEFAULT_MAX_READ_CHARS = 12_000;
const MAX_FILES_TO_SCAN = 400;

export async function executeOpenAIHostTool(
	fileService: IFileService,
	workingDirectory: URI | undefined,
	toolName: string,
	args: Record<string, unknown>,
): Promise<string> {
	switch (toolName) {
		case 'search_workspace_text':
			return searchWorkspaceText(fileService, workingDirectory, args);
		case 'read_workspace_file':
			return readWorkspaceFile(fileService, workingDirectory, args);
		default:
			throw new Error(`Unknown host tool: ${toolName}`);
	}
}

export function isOpenAIHostTool(toolName: string): boolean {
	return toolName === 'search_workspace_text' || toolName === 'read_workspace_file';
}

async function readWorkspaceFile(fileService: IFileService, workingDirectory: URI | undefined, args: Record<string, unknown>): Promise<string> {
	const pathArg = typeof args.path === 'string' ? args.path.trim() : '';
	if (!pathArg) {
		throw new Error('read_workspace_file requires a path.');
	}
	const resource = resolveWorkspacePath(workingDirectory, pathArg);
	const maxChars = typeof args.maxChars === 'number' && args.maxChars > 0 ? Math.min(args.maxChars, 48_000) : DEFAULT_MAX_READ_CHARS;
	const content = await fileService.readFile(resource);
	const text = content.value.toString();
	if (text.length <= maxChars) {
		return text;
	}
	return `${text.slice(0, maxChars)}\n\n[truncated to ${maxChars} characters]`;
}

async function searchWorkspaceText(fileService: IFileService, workingDirectory: URI | undefined, args: Record<string, unknown>): Promise<string> {
	const query = typeof args.query === 'string' ? args.query.trim() : '';
	if (!query) {
		throw new Error('search_workspace_text requires a query.');
	}
	const maxResults = typeof args.maxResults === 'number' && args.maxResults > 0 ? Math.min(args.maxResults, 50) : DEFAULT_MAX_SEARCH_RESULTS;
	const root = workingDirectory ?? URI.file('/');
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
	});
	if (matches.length === 0) {
		return `No matches found for "${query}" (scanned ${scanned} files).`;
	}
	return `Found ${matches.length} match(es) for "${query}":\n\n${matches.join('\n')}`;
}

function resolveWorkspacePath(workingDirectory: URI | undefined, pathArg: string): URI {
	if (/^[a-zA-Z]:[\\/]/.test(pathArg) || pathArg.startsWith('/')) {
		return URI.file(pathArg);
	}
	if (workingDirectory) {
		return joinPath(workingDirectory, pathArg);
	}
	return URI.file(pathArg);
}

async function scanDirectory(fileService: IFileService, resource: URI, visitor: (resource: URI) => Promise<void>): Promise<void> {
	let stat;
	try {
		stat = await fileService.stat(resource);
	} catch {
		return;
	}
	if (!stat.isDirectory) {
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
		await scanDirectory(fileService, child.resource, visitor);
	}
}
