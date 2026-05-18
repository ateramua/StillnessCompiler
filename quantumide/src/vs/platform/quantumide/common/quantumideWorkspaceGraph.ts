/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

export const QUANTUMIDE_AI_WORKSPACE_INDEX_STORAGE_KEY = 'quantumide.ai.workspaceIndex';

export const enum QuantumIDEManifestKind {
	PackageJson = 'package.json',
	RequirementsTxt = 'requirements.txt',
	Git = '.git',
	TsConfig = 'tsconfig.json',
	CargoToml = 'Cargo.toml',
	PomXml = 'pom.xml',
	GoMod = 'go.mod',
	ComposerJson = 'composer.json',
	PyprojectToml = 'pyproject.toml',
}

export const QuantumIDEManifestNames = new Set<string>([
	QuantumIDEManifestKind.PackageJson,
	QuantumIDEManifestKind.RequirementsTxt,
	QuantumIDEManifestKind.Git,
	QuantumIDEManifestKind.TsConfig,
	QuantumIDEManifestKind.CargoToml,
	QuantumIDEManifestKind.PomXml,
	QuantumIDEManifestKind.GoMod,
	QuantumIDEManifestKind.ComposerJson,
	QuantumIDEManifestKind.PyprojectToml,
]);

export const QuantumIDEWorkspaceIndexExcludeNames = new Set<string>([
	'.cache',
	'.git',
	'.hg',
	'.svn',
	'.turbo',
	'.yarn',
	'build',
	'dist',
	'node_modules',
	'out',
]);

export interface IQuantumIDEWorkspaceFolderNode {
	readonly name: string;
	readonly uri: string;
}

export interface IQuantumIDEManifestNode {
	readonly kind: QuantumIDEManifestKind;
	readonly name: string;
	readonly uri: string;
	readonly workspaceRelativePath: string;
	readonly projectPath: string;
}

export interface IQuantumIDEProjectNode {
	readonly id: string;
	readonly name: string;
	readonly rootUri: string;
	readonly workspaceRelativePath: string;
	readonly ecosystem: string;
	readonly manifestKinds: readonly QuantumIDEManifestKind[];
	readonly frameworks: readonly string[];
}

export interface IQuantumIDEFileNode {
	readonly uri: string;
	readonly workspaceRelativePath: string;
	readonly name: string;
	readonly extension?: string;
}

export interface IQuantumIDEWorkspaceGraphStatus {
	readonly indexed: boolean;
	readonly generatedAt?: string;
	readonly reason?: string;
	readonly truncated?: boolean;
	readonly fileLimit?: number;
}

export interface IQuantumIDEWorkspaceGraph {
	readonly version: 1;
	readonly workspaceId: string;
	readonly folders: readonly IQuantumIDEWorkspaceFolderNode[];
	readonly projects: readonly IQuantumIDEProjectNode[];
	readonly manifests: readonly IQuantumIDEManifestNode[];
	readonly files: readonly IQuantumIDEFileNode[];
	readonly status: IQuantumIDEWorkspaceGraphStatus;
}

export interface IQuantumIDESemanticIndexQuery {
	readonly query: string;
	readonly maxResults?: number;
}

export interface IQuantumIDESemanticIndexResult {
	readonly uri: string;
	readonly score: number;
	readonly excerpt?: string;
}

export interface IQuantumIDESemanticIndexProvider {
	readonly enabled: false;
	query(_request: IQuantumIDESemanticIndexQuery): Promise<readonly IQuantumIDESemanticIndexResult[]>;
}

export const DisabledQuantumIDESemanticIndexProvider: IQuantumIDESemanticIndexProvider = {
	enabled: false,
	async query(): Promise<readonly IQuantumIDESemanticIndexResult[]> {
		return [];
	},
};

export function detectQuantumIDEManifestKind(name: string): QuantumIDEManifestKind | undefined {
	switch (name) {
		case QuantumIDEManifestKind.PackageJson:
			return QuantumIDEManifestKind.PackageJson;
		case QuantumIDEManifestKind.RequirementsTxt:
			return QuantumIDEManifestKind.RequirementsTxt;
		case QuantumIDEManifestKind.Git:
			return QuantumIDEManifestKind.Git;
		case QuantumIDEManifestKind.TsConfig:
			return QuantumIDEManifestKind.TsConfig;
		case QuantumIDEManifestKind.CargoToml:
			return QuantumIDEManifestKind.CargoToml;
		case QuantumIDEManifestKind.PomXml:
			return QuantumIDEManifestKind.PomXml;
		case QuantumIDEManifestKind.GoMod:
			return QuantumIDEManifestKind.GoMod;
		case QuantumIDEManifestKind.ComposerJson:
			return QuantumIDEManifestKind.ComposerJson;
		case QuantumIDEManifestKind.PyprojectToml:
			return QuantumIDEManifestKind.PyprojectToml;
		default:
			return undefined;
	}
}

export function getQuantumIDEManifestEcosystem(kind: QuantumIDEManifestKind): string {
	switch (kind) {
		case QuantumIDEManifestKind.PackageJson:
		case QuantumIDEManifestKind.TsConfig:
			return 'node/typescript';
		case QuantumIDEManifestKind.RequirementsTxt:
		case QuantumIDEManifestKind.PyprojectToml:
			return 'python';
		case QuantumIDEManifestKind.CargoToml:
			return 'rust';
		case QuantumIDEManifestKind.PomXml:
			return 'java';
		case QuantumIDEManifestKind.GoMod:
			return 'go';
		case QuantumIDEManifestKind.ComposerJson:
			return 'php';
		case QuantumIDEManifestKind.Git:
			return 'git';
	}
}

export function createEmptyQuantumIDEWorkspaceGraph(workspaceId: string, folders: readonly IQuantumIDEWorkspaceFolderNode[], reason: string): IQuantumIDEWorkspaceGraph {
	return {
		version: 1,
		workspaceId,
		folders,
		projects: [],
		manifests: [],
		files: [],
		status: { indexed: false, reason },
	};
}

export function summarizeQuantumIDEWorkspaceGraph(graph: IQuantumIDEWorkspaceGraph): string {
	const manifestCounts = new Map<QuantumIDEManifestKind, number>();
	for (const manifest of graph.manifests) {
		manifestCounts.set(manifest.kind, (manifestCounts.get(manifest.kind) ?? 0) + 1);
	}
	const manifestSummary = [...manifestCounts.entries()]
		.sort((left, right) => left[0].localeCompare(right[0]))
		.map(([kind, count]) => `${kind}: ${count}`)
		.join(', ') || 'none';
	return `projects=${graph.projects.length}, manifests=${manifestSummary}, files=${graph.files.length}${graph.status.truncated ? `, truncated at ${graph.status.fileLimit ?? graph.files.length}` : ''}`;
}
