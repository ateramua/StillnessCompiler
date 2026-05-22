/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { parseGitignorePatterns, shouldQuantumIDEIgnorePath } from './quantumideGitignore.js';

/** Blocks indexing and all AI access (Cursor `.cursorignore` parity). */
export const QUANTUMIDE_IGNORE_FILE = '.quantumideignore';

/** Cursor-compatible ignore file (merged into AI ignore patterns). */
export const CURSOR_IGNORE_FILE = '.cursorignore';

/** Excludes paths from indexing only; AI tools may still read unless also in QUANTUMIDE_IGNORE_FILE. */
export const QUANTUMIDE_INDEXING_IGNORE_FILE = '.quantumideindexingignore';

export type QuantumIDEIgnoreMode = 'index' | 'ai' | 'all';

export interface IQuantumIDEWorkspaceIgnorePolicy {
	readonly aiPatterns: readonly string[];
	readonly indexingOnlyPatterns: readonly string[];
	readonly excludedDirectoryNames: ReadonlySet<string>;
	readonly secretFileNames: ReadonlySet<string>;
}

const DEFAULT_SECRET_NAMES = new Set(['.env', '.env.local', '.env.production']);

export function parseQuantumIDEIgnoreFile(content: string): string[] {
	return parseGitignorePatterns(content);
}

export function mergeQuantumIDEIgnorePolicy(
	excludedDirectoryNames: ReadonlySet<string>,
	aiIgnoreContent: string | undefined,
	indexingIgnoreContent: string | undefined,
	extraSecretNames: readonly string[] = [],
): IQuantumIDEWorkspaceIgnorePolicy {
	const secretFileNames = new Set(DEFAULT_SECRET_NAMES);
	for (const name of extraSecretNames) {
		const t = name.trim();
		if (t) {
			secretFileNames.add(t);
		}
	}
	return {
		aiPatterns: aiIgnoreContent ? parseQuantumIDEIgnoreFile(aiIgnoreContent) : [],
		indexingOnlyPatterns: indexingIgnoreContent ? parseQuantumIDEIgnoreFile(indexingIgnoreContent) : [],
		excludedDirectoryNames,
		secretFileNames,
	};
}

export function isQuantumIDESecretFileName(name: string, secretFileNames: ReadonlySet<string>): boolean {
	if (secretFileNames.has(name)) {
		return true;
	}
	const lower = name.toLowerCase();
	return lower.endsWith('.pem') || lower.endsWith('.key') || lower.endsWith('.p12');
}

/**
 * @param mode `index` — indexing + scan; `ai` — agent read/search/@; `all` — both layers
 */
export function isQuantumIDEPathIgnored(
	relativePath: string,
	policy: IQuantumIDEWorkspaceIgnorePolicy,
	mode: QuantumIDEIgnoreMode,
	fileName?: string,
): boolean {
	const name = fileName ?? relativePath.split('/').pop() ?? relativePath;
	if (isQuantumIDESecretFileName(name, policy.secretFileNames)) {
		return true;
	}
	if (shouldQuantumIDEIgnorePath(relativePath, policy.aiPatterns, policy.excludedDirectoryNames)) {
		return true;
	}
	if ((mode === 'index' || mode === 'all') && shouldQuantumIDEIgnorePath(relativePath, policy.indexingOnlyPatterns, policy.excludedDirectoryNames)) {
		return true;
	}
	return false;
}
