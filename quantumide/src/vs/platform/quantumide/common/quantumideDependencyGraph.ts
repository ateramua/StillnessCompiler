/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { extractImports } from './quantumideRefactorOperations.js';

export interface IQuantumIDEDependencyNode {
	readonly id: string;
	readonly kind: 'package' | 'module' | 'file';
	readonly label: string;
	readonly dependencies: readonly string[];
}

export interface IQuantumIDEDependencyGraph {
	readonly version: 1;
	readonly generatedAt: string;
	readonly nodes: readonly IQuantumIDEDependencyNode[];
}

export function buildDependencyGraph(manifests: { path: string; content: string }[], files: { path: string; content: string }[]): IQuantumIDEDependencyGraph {
	const nodes: IQuantumIDEDependencyNode[] = [];
	for (const manifest of manifests) {
		if (!manifest.path.endsWith('package.json')) {
			continue;
		}
		try {
			const json = JSON.parse(manifest.content) as Record<string, unknown>;
			const name = typeof json.name === 'string' ? json.name : manifest.path;
			const deps = [
				...Object.keys(asStringRecord(json.dependencies)),
				...Object.keys(asStringRecord(json.devDependencies)),
			];
			nodes.push({
				id: `pkg:${name}`,
				kind: 'package',
				label: name,
				dependencies: deps.map(d => `pkg:${d}`),
			});
		} catch {
			// skip
		}
	}
	for (const file of files) {
		const imports = extractImports(file.content);
		nodes.push({
			id: `file:${file.path}`,
			kind: 'file',
			label: file.path,
			dependencies: imports.map(i => `mod:${i}`),
		});
	}
	return { version: 1, generatedAt: new Date().toISOString(), nodes };
}

function asStringRecord(value: unknown): Record<string, string> {
	if (!value || typeof value !== 'object') {
		return {};
	}
	const out: Record<string, string> = {};
	for (const [k, v] of Object.entries(value)) {
		if (typeof v === 'string') {
			out[k] = v;
		}
	}
	return out;
}

export function formatDependencyGraphSummary(graph: IQuantumIDEDependencyGraph, maxNodes = 40): string {
	return graph.nodes.slice(0, maxNodes).map(n => `- ${n.label} depends on [${n.dependencies.join(', ')}]`).join('\n');
}
