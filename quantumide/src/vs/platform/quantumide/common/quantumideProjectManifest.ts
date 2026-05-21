/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { QuantumIDEManifestKind, type IQuantumIDEManifestNode } from './quantumideWorkspaceGraph.js';

export interface IQuantumIDEProjectManifestSummary {
	readonly path: string;
	readonly kind: QuantumIDEManifestKind;
	readonly name?: string;
	readonly version?: string;
	readonly description?: string;
	readonly scripts?: readonly string[];
	readonly dependencies?: readonly string[];
	readonly pythonRequires?: string;
}

export function parseProjectManifestSummary(kind: QuantumIDEManifestKind, path: string, content: string): IQuantumIDEProjectManifestSummary {
	const base = { path, kind };
	try {
		switch (kind) {
			case QuantumIDEManifestKind.PackageJson:
			case QuantumIDEManifestKind.ComposerJson: {
				const json = JSON.parse(content) as Record<string, unknown>;
				return {
					...base,
					name: typeof json.name === 'string' ? json.name : undefined,
					version: typeof json.version === 'string' ? json.version : undefined,
					description: typeof json.description === 'string' ? json.description : undefined,
					scripts: json.scripts && typeof json.scripts === 'object'
						? Object.keys(json.scripts as Record<string, unknown>).slice(0, 24)
						: undefined,
					dependencies: json.dependencies && typeof json.dependencies === 'object'
						? Object.keys(json.dependencies as Record<string, unknown>).slice(0, 20)
						: undefined,
				};
			}
			case QuantumIDEManifestKind.PyprojectToml:
				return {
					...base,
					name: extractTomlString(content, 'name'),
					version: extractTomlString(content, 'version'),
					description: extractTomlString(content, 'description'),
					pythonRequires: extractTomlString(content, 'requires-python'),
				};
			case QuantumIDEManifestKind.CargoToml:
				return {
					...base,
					name: extractTomlString(content, 'name'),
					version: extractTomlString(content, 'version'),
					description: extractTomlString(content, 'description'),
				};
			case QuantumIDEManifestKind.GoMod: {
				const first = content.split('\n').find(l => l.startsWith('module '));
				return { ...base, name: first?.replace(/^module\s+/, '').trim() };
			}
			case QuantumIDEManifestKind.RequirementsTxt: {
				const deps = content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#')).slice(0, 15);
				return { ...base, dependencies: deps };
			}
			case QuantumIDEManifestKind.TsConfig: {
				const json = JSON.parse(content) as Record<string, unknown>;
				const compiler = json.compilerOptions as Record<string, unknown> | undefined;
				return {
					...base,
					description: compiler ? `target=${compiler.target ?? '?'} strict=${compiler.strict ?? '?'}` : undefined,
				};
			}
			default:
				return base;
		}
	} catch {
		return base;
	}
}

function extractTomlString(content: string, key: string): string | undefined {
	const match = content.match(new RegExp(`^${key}\\s*=\\s*["']([^"']+)["']`, 'm'));
	return match?.[1];
}

export function formatProjectManifestSummaries(summaries: readonly IQuantumIDEProjectManifestSummary[]): string {
	if (summaries.length === 0) {
		return 'No project manifests detected.';
	}
	return summaries.map(s => {
		const parts = [`### ${s.path} (${s.kind})`];
		if (s.name) {
			parts.push(`name: ${s.name}`);
		}
		if (s.version) {
			parts.push(`version: ${s.version}`);
		}
		if (s.description) {
			parts.push(s.description);
		}
		if (s.scripts?.length) {
			parts.push(`scripts: ${s.scripts.join(', ')}`);
		}
		if (s.dependencies?.length) {
			parts.push(`deps: ${s.dependencies.join(', ')}`);
		}
		if (s.pythonRequires) {
			parts.push(`requires-python: ${s.pythonRequires}`);
		}
		return parts.join('\n');
	}).join('\n\n');
}

export function manifestNodesToSummaryRequests(nodes: readonly IQuantumIDEManifestNode[]): { path: string; kind: QuantumIDEManifestKind }[] {
	return nodes.map(n => ({ path: n.workspaceRelativePath, kind: n.kind }));
}
