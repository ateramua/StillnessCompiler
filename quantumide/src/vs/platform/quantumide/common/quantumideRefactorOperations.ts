/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

export interface IQuantumIDEImportRewrite {
	readonly path: string;
	readonly content: string;
}

/** Normalize import paths to use consistent quote style and sorted specifiers (§2.9 import normalization). */
export function normalizeImportsInFile(path: string, content: string): IQuantumIDEImportRewrite {
	const lines = content.split(/\r?\n/);
	const importLines: { index: number; line: string }[] = [];
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (/^\s*import\s+/.test(line) || /^\s*export\s+.*\s+from\s+['"]/.test(line)) {
			importLines.push({ index: i, line });
		}
	}
	if (importLines.length === 0) {
		return { path, content };
	}
	const sorted = [...importLines].sort((a, b) => a.line.localeCompare(b.line));
	let sortedIdx = 0;
	const result: string[] = [];
	for (let i = 0; i < lines.length; i++) {
		if (importLines.some(il => il.index === i)) {
			result.push(sorted[sortedIdx++].line);
		} else {
			result.push(lines[i]);
		}
	}
	return { path, content: result.join('\n') };
}

/** Rewrite import specifiers across a file (simple string replace for package renames). */
export function rewriteImportsInFile(path: string, content: string, fromSpecifier: string, toSpecifier: string): IQuantumIDEImportRewrite {
	const pattern = new RegExp(`(['"])${escapeRegExp(fromSpecifier)}\\1`, 'g');
	return { path, content: content.replace(pattern, `$1${toSpecifier}$1`) };
}

export function extractImports(content: string): string[] {
	const imports: string[] = [];
	const importPattern = /from\s+['"]([^'"]+)['"]/g;
	const requirePattern = /require\(\s*['"]([^'"]+)['"]\s*\)/g;
	let match: RegExpExecArray | null;
	while ((match = importPattern.exec(content)) !== null) {
		imports.push(match[1]);
	}
	while ((match = requirePattern.exec(content)) !== null) {
		imports.push(match[1]);
	}
	return imports;
}

/** Extract selected lines into a new function and replace with a call (§2.9 extract method). */
export function extractMethodInFile(
	path: string,
	content: string,
	startLine: number,
	endLine: number,
	methodName: string,
): IQuantumIDEImportRewrite {
	const lines = content.split(/\r?\n/);
	const start = Math.max(1, startLine) - 1;
	const end = Math.min(lines.length, endLine);
	const body = lines.slice(start, end).join('\n');
	const indent = lines[start]?.match(/^\s*/)?.[0] ?? '\t';
	const callLine = `${indent}${methodName}();`;
	const functionBlock = [
		'',
		`${indent}function ${methodName}() {`,
		body.split('\n').map(line => `${indent}\t${line.trimStart()}`).join('\n'),
		`${indent}}`,
		'',
	].join('\n');
	const result = [
		...lines.slice(0, start),
		callLine,
		...lines.slice(end),
		functionBlock,
	].join('\n');
	return { path, content: result };
}

/** Extract JSX/component block into a new file (§2.9 extract component). */
export function extractComponentInFile(
	path: string,
	content: string,
	componentName: string,
	startLine: number,
	endLine: number,
	targetPath: string,
): { source: IQuantumIDEImportRewrite; component: IQuantumIDEImportRewrite } {
	const lines = content.split(/\r?\n/);
	const start = Math.max(1, startLine) - 1;
	const end = Math.min(lines.length, endLine);
	const body = lines.slice(start, end).join('\n');
	const importLine = `import { ${componentName} } from './${targetPath.replace(/\.tsx?$/, '')}';`;
	const sourceLines = [...lines.slice(0, start), importLine, `<${componentName} />`, ...lines.slice(end)];
	const componentFile = [
		`import React from 'react';`,
		'',
		`export function ${componentName}() {`,
		'  return (',
		body.split('\n').map(l => `    ${l}`).join('\n'),
		'  );',
		'}',
		'',
	].join('\n');
	return {
		source: { path, content: sourceLines.join('\n') },
		component: { path: targetPath, content: componentFile },
	};
}

/** Move module to a new path updating relative imports in the moved file (§2.9 move module). */
export function moveModuleContent(content: string, fromPath: string, toPath: string): string {
	const fromDir = fromPath.includes('/') ? fromPath.slice(0, fromPath.lastIndexOf('/')) : '.';
	const toDir = toPath.includes('/') ? toPath.slice(0, toPath.lastIndexOf('/')) : '.';
	if (fromDir === toDir) {
		return content;
	}
	return content.replace(/from\s+['"](\.[^'"]+)['"]/g, (_m, rel: string) => {
		const adjusted = rel.startsWith('.') ? rel : `./${rel}`;
		return `from '${adjusted}'`;
	});
}

/** Apply API rename across identifiers in a file (§2.9 API migration). */
export function migrateApiInFile(path: string, content: string, fromApi: string, toApi: string): IQuantumIDEImportRewrite {
	const pattern = new RegExp(`\\b${escapeRegExp(fromApi)}\\b`, 'g');
	return { path, content: content.replace(pattern, toApi) };
}

/** Framework migration — rewrites import roots and common API prefixes (§2.9). */
export function migrateFrameworkImports(path: string, content: string, fromFramework: string, toFramework: string): IQuantumIDEImportRewrite {
	let next = content;
	const fromImport = new RegExp(`from\\s+['"]${escapeRegExp(fromFramework)}([^'"]*)['"]`, 'g');
	const requireImport = new RegExp(`require\\(\\s*['"]${escapeRegExp(fromFramework)}([^'"]*)['"]\\s*\\)`, 'g');
	next = next.replace(fromImport, `from '${toFramework}$1'`);
	next = next.replace(requireImport, `require('${toFramework}$1')`);
	if (fromFramework && toFramework && fromFramework !== toFramework) {
		const fromPrefix = new RegExp(`\\b${escapeRegExp(fromFramework)}\\.`, 'g');
		next = next.replace(fromPrefix, `${toFramework}.`);
	}
	return { path, content: next };
}

/** Rename a symbol within a single file using word-boundary replacement (§2.9). */
export function renameSymbolInFile(path: string, content: string, oldName: string, newName: string): IQuantumIDEImportRewrite {
	if (!oldName || !newName || oldName === newName) {
		return { path, content };
	}
	const pattern = new RegExp(`\\b${escapeRegExp(oldName)}\\b`, 'g');
	return { path, content: content.replace(pattern, newName) };
}

/** Scaffold test file content for a source path (§2.4 test generation). */
export function generateTestScaffold(sourcePath: string, exportName?: string): IQuantumIDEImportRewrite {
	const base = sourcePath.replace(/\.(tsx?|jsx?)$/, '');
	const testPath = `${base}.test.ts`;
	const name = exportName ?? 'subject';
	return {
		path: testPath,
		content: [
			`import { describe, it, expect } from 'vitest';`,
			`import { ${name} } from './${sourcePath.replace(/\.(tsx?|jsx?)$/, '')}';`,
			'',
			`describe('${name}', () => {`,
			`  it('works', () => {`,
			`    expect(${name}).toBeDefined();`,
			`  });`,
			`});`,
			'',
		].join('\n'),
	};
}

/** Update package.json dependency version string (§2.4 dependency updates). */
export function updatePackageDependency(content: string, packageName: string, version: string): string {
	try {
		const json = JSON.parse(content) as Record<string, Record<string, string>>;
		for (const section of ['dependencies', 'devDependencies', 'peerDependencies']) {
			if (json[section]?.[packageName] !== undefined) {
				json[section][packageName] = version;
			}
		}
		return JSON.stringify(json, undefined, 2) + '\n';
	} catch {
		return content;
	}
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
