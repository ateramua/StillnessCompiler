/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import type { IFileService } from '../../files/common/files.js';
import { resolveQuantumIDEWorkspacePath } from './quantumideWorkspaceEdits.js';

const MAX_SYMBOL_HITS = 60;
const MAX_REFERENCE_HITS = 40;
const MAX_FILES_TO_SCAN = 350;

const SYMBOL_LINE_PATTERNS = [
	/^\s*(?:export\s+)?(?:async\s+)?(?:function|class|interface|type|enum)\s+(\w+)/,
	/^\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*[=:]/,
];

export async function searchWorkspaceSymbols(
	fileService: IFileService,
	workingDirectory: URI | undefined,
	query: string,
	maxResults = MAX_SYMBOL_HITS,
): Promise<string> {
	const needle = query.trim().toLowerCase();
	if (!needle) {
		throw new Error('search_workspace_symbols requires a query.');
	}
	const root = workingDirectory ?? URI.file('/');
	const hits: string[] = [];
	let scanned = 0;
	await scanDirectory(fileService, root, async resource => {
		if (hits.length >= maxResults || scanned >= MAX_FILES_TO_SCAN) {
			return;
		}
		scanned++;
		if (!isLikelySourceFile(resource)) {
			return;
		}
		try {
			const text = (await fileService.readFile(resource)).value.toString();
			const relative = workingDirectory ? resource.fsPath.slice(workingDirectory.fsPath.length + 1) : resource.fsPath;
			const lines = text.split(/\r?\n/);
			for (let i = 0; i < lines.length && hits.length < maxResults; i++) {
				const line = lines[i];
				for (const pattern of SYMBOL_LINE_PATTERNS) {
					const match = line.match(pattern);
					const name = match?.[1];
					if (name && name.toLowerCase().includes(needle)) {
						hits.push(`${relative}:${i + 1} ${name}`);
						break;
					}
				}
			}
		} catch {
			// skip unreadable files
		}
	});
	if (hits.length === 0) {
		return `No symbols matching "${query}" were found.`;
	}
	return `Symbols matching "${query}" (${hits.length}):\n\n${hits.join('\n')}`;
}

export async function findSymbolReferences(
	fileService: IFileService,
	workingDirectory: URI | undefined,
	symbol: string,
	maxResults = MAX_REFERENCE_HITS,
): Promise<string> {
	const needle = symbol.trim();
	if (!needle) {
		throw new Error('find_symbol_references requires a symbol name.');
	}
	const root = workingDirectory ?? URI.file('/');
	const pattern = new RegExp(`\\b${escapeRegExp(needle)}\\b`);
	const hits: string[] = [];
	let scanned = 0;
	await scanDirectory(fileService, root, async resource => {
		if (hits.length >= maxResults || scanned >= MAX_FILES_TO_SCAN) {
			return;
		}
		scanned++;
		if (!isLikelySourceFile(resource)) {
			return;
		}
		try {
			const text = (await fileService.readFile(resource)).value.toString();
			const relative = workingDirectory ? resource.fsPath.slice(workingDirectory.fsPath.length + 1) : resource.fsPath;
			const lines = text.split(/\r?\n/);
			for (let i = 0; i < lines.length && hits.length < maxResults; i++) {
				if (pattern.test(lines[i])) {
					hits.push(`${relative}:${i + 1} ${lines[i].trim().slice(0, 120)}`);
				}
			}
		} catch {
			// skip
		}
	});
	if (hits.length === 0) {
		return `No references to "${symbol}" were found.`;
	}
	return `References to "${symbol}" (${hits.length}):\n\n${hits.join('\n')}`;
}

export async function resolveImportDependencies(
	fileService: IFileService,
	workingDirectory: URI | undefined,
	pathArg: string,
): Promise<string> {
	const resource = resolveQuantumIDEWorkspacePath(workingDirectory, pathArg);
	const text = (await fileService.readFile(resource)).value.toString();
	const imports: string[] = [];
	const importPattern = /^\s*import\s+(?:[\w*{}\s,]+\s+from\s+)?['"]([^'"]+)['"]/gm;
	const requirePattern = /require\(\s*['"]([^'"]+)['"]\s*\)/g;
	let match: RegExpExecArray | null;
	while ((match = importPattern.exec(text)) !== null) {
		imports.push(match[1]);
	}
	while ((match = requirePattern.exec(text)) !== null) {
		imports.push(match[1]);
	}
	if (imports.length === 0) {
		return `No import dependencies found in ${pathArg}.`;
	}
	const unique = [...new Set(imports)].slice(0, 80);
	return `Import dependencies in ${pathArg} (${unique.length}):\n\n${unique.map(dep => `- ${dep}`).join('\n')}`;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isLikelySourceFile(resource: URI): boolean {
	const path = resource.path.toLowerCase();
	return /\.(ts|tsx|js|jsx|py|go|rs|java|cs|cpp|c|h|md|json|yaml|yml)$/.test(path);
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
