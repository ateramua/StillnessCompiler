/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Minimal .gitignore matcher for indexer exclusion (§2.3).
 */
export function parseGitignorePatterns(content: string): string[] {
	return content
		.split(/\r?\n/)
		.map(line => line.trim())
		.filter(line => line.length > 0 && !line.startsWith('#'));
}

export function shouldQuantumIDEIgnorePath(
	relativePath: string,
	gitignorePatterns: readonly string[],
	excludedDirectoryNames: ReadonlySet<string>,
): boolean {
	const normalized = relativePath.replace(/\\/g, '/');
	const segments = normalized.split('/');
	for (const segment of segments) {
		if (excludedDirectoryNames.has(segment)) {
			return true;
		}
	}
	return isIgnoredByGitignore(normalized, gitignorePatterns);
}

export function isIgnoredByGitignore(relativePath: string, patterns: readonly string[]): boolean {
	const normalized = relativePath.replace(/\\/g, '/');
	for (const pattern of patterns) {
		if (pattern.endsWith('/') && normalized.startsWith(pattern.slice(0, -1))) {
			return true;
		}
		if (pattern.includes('*')) {
			const regex = new RegExp(`^${pattern.replace(/\./g, '\\.').replace(/\*\*/g, '§§').replace(/\*/g, '[^/]*').replace(/§§/g, '.*')}$`);
			if (regex.test(normalized) || regex.test(normalized.split('/').pop() ?? '')) {
				return true;
			}
			continue;
		}
		if (normalized === pattern || normalized.endsWith(`/${pattern}`) || normalized.includes(`/${pattern}/`)) {
			return true;
		}
	}
	return false;
}
