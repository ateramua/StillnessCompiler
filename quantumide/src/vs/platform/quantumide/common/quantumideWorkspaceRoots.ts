/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { relativePath } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { assertSafeWorkspaceRelativePath, isUriUnderWorkspaceRoots } from './quantumideWorkspacePathSecurity.js';
import type { IQuantumIDEWorkspaceLink } from './workspaceLinks.js';

export interface IQuantumIDEWorkspaceRootRef {
	readonly name: string;
	readonly uri: URI;
}

/** Build link records for every VS Code workspace folder (multi-root / .code-workspace). */
export function formatWorkspaceFolderLinks(folders: readonly { name: string; uri: URI }[]): IQuantumIDEWorkspaceLink[] {
	return folders.map(folder => ({
		name: folder.name,
		path: folder.uri.fsPath,
	}));
}

export function workspaceLinksToJson(links: readonly IQuantumIDEWorkspaceLink[]): string {
	return JSON.stringify({ version: 1, roots: links }, undefined, 2);
}

/** Primary search roots: working directory + every linked / workspace folder (deduped). */
export function collectAgentSearchRoots(workingDirectory: URI | undefined, links: readonly IQuantumIDEWorkspaceLink[]): URI[] {
	const roots: URI[] = [];
	const seen = new Set<string>();
	const add = (uri: URI | undefined) => {
		if (!uri?.fsPath) {
			return;
		}
		const key = uri.fsPath.toLowerCase();
		if (seen.has(key)) {
			return;
		}
		seen.add(key);
		roots.push(uri);
	};
	add(workingDirectory);
	for (const link of links) {
		if (link.path) {
			add(URI.file(link.path));
		}
	}
	return roots.length ? roots : [workingDirectory ?? URI.file('/')];
}

/**
 * Resolve a workspace-relative path against multi-root workspaces.
 * Supports `FolderName/sub/path` when folder name matches a workspace root.
 */
export function resolvePathAcrossWorkspaceRoots(
	workingDirectory: URI | undefined,
	links: readonly IQuantumIDEWorkspaceLink[],
	pathArg: string,
): URI {
	const trimmed = pathArg.trim().replace(/\\/g, '/');
	if (!trimmed) {
		throw new Error('Path is required.');
	}
	const roots = collectAgentSearchRoots(workingDirectory, links);
	if (/^[a-zA-Z]:/.test(trimmed) || trimmed.startsWith('/')) {
		const absolute = URI.file(trimmed);
		if (roots.length > 0 && !isUriUnderWorkspaceRoots(absolute, roots)) {
			throw new Error(`Absolute path is outside workspace roots: ${trimmed}`);
		}
		return absolute;
	}
	assertSafeWorkspaceRelativePath(trimmed);
	const slash = trimmed.indexOf('/');
	const folderPrefix = slash > 0 ? trimmed.slice(0, slash) : undefined;
	const rest = slash > 0 ? trimmed.slice(slash + 1) : trimmed;
	if (folderPrefix) {
		const match = roots.find(root => {
			const link = links.find(l => l.name === folderPrefix);
			if (link && root.fsPath === URI.file(link.path).fsPath) {
				return true;
			}
			return root.fsPath.split(/[/\\]/).pop()?.toLowerCase() === folderPrefix.toLowerCase();
		});
		if (match) {
			const resolved = rest ? URI.joinPath(match, rest) : match;
			if (!isUriUnderWorkspaceRoots(resolved, roots)) {
				throw new Error(`Resolved path escapes workspace roots: ${trimmed}`);
			}
			return resolved;
		}
	}
	let resolved: URI;
	if (workingDirectory) {
		resolved = URI.joinPath(workingDirectory, trimmed);
	} else if (roots[0]) {
		resolved = URI.joinPath(roots[0], trimmed);
	} else {
		resolved = URI.file(trimmed);
	}
	if (roots.length > 0 && !isUriUnderWorkspaceRoots(resolved, roots)) {
		throw new Error(`Resolved path escapes workspace roots: ${trimmed}`);
	}
	return resolved;
}

/** Resolve `IChatRequestWorkspaceVariableEntry.value` (workspace-relative path string) to a URI. */
export function resolveQuantumIDEWorkspaceVariablePath(
	pathValue: string,
	folders: readonly { name: string; uri: URI }[],
): URI | undefined {
	const trimmed = pathValue?.trim();
	if (!trimmed) {
		return undefined;
	}
	const links = formatWorkspaceFolderLinks(folders);
	const primary = folders[0]?.uri;
	try {
		return resolvePathAcrossWorkspaceRoots(primary, links, trimmed);
	} catch {
		return resolveWorkspaceGraphPath(trimmed, links, primary);
	}
}

/** Resolve `workspaceRelativePath` from the workspace graph to a URI (multi-root aware). */
export function resolveWorkspaceGraphPath(
	workspaceRelativePath: string,
	links: readonly IQuantumIDEWorkspaceLink[],
	fallbackFolder: URI | undefined,
): URI | undefined {
	const trimmed = workspaceRelativePath.replace(/\\/g, '/').replace(/^\.\//, '');
	if (!trimmed) {
		return undefined;
	}
	try {
		return resolvePathAcrossWorkspaceRoots(fallbackFolder, links, trimmed);
	} catch {
		return undefined;
	}
}

export function formatWorkspaceRootsForAgent(workingDirectory: URI | undefined, links: readonly IQuantumIDEWorkspaceLink[]): string {
	const roots = collectAgentSearchRoots(workingDirectory, links);
	if (roots.length === 0) {
		return 'No workspace folder is open.';
	}
	const lines = roots.map((root, index) => {
		const link = links.find(l => URI.file(l.path).fsPath === root.fsPath);
		const label = link?.name ?? root.fsPath.split(/[/\\]/).pop() ?? root.fsPath;
		const primary = index === 0 && workingDirectory && root.fsPath === workingDirectory.fsPath ? ' (primary)' : '';
		return `- ${label}${primary}: ${root.fsPath}`;
	});
	return [
		'All workspace roots visible to tools (same as Explorer when using a .code-workspace or multi-root folder):',
		...lines,
		'Use paths like `FolderName/relative/path` when multiple roots are listed.',
	].join('\n');
}

export function relativePathInWorkspaceRoots(resource: URI, roots: readonly URI[]): string | undefined {
	for (const root of roots) {
		const rel = relativePath(root, resource);
		if (rel !== undefined) {
			const name = root.fsPath.split(/[/\\]/).pop() ?? 'root';
			return roots.length > 1 ? `${name}/${rel}` : rel;
		}
	}
	return undefined;
}
