/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { formatQuantumIDEWorkspaceContextHeaders } from './quantumideLiteSnapshotContext.js';
import {
	summarizeQuantumIDEWorkspaceGraph,
	type IQuantumIDEWorkspaceGraph,
} from './quantumideWorkspaceGraph.js';

/** AC-03-05 / RR-03: compact attach must be at least this fraction smaller than full. */
export const QUANTUMIDE_GRAPH_CONTEXT_COMPACT_MIN_REDUCTION = 0.5;

const MAX_PROJECTS_IN_CONTEXT = 20;
const MAX_MANIFESTS_IN_CONTEXT = 40;

export type QuantumIDEWorkspaceGraphContextAttachMode = 'full' | 'compact';

export interface IQuantumIDEWorkspaceGraphContextAttachState {
	readonly generation: number;
	readonly fingerprint: string;
	readonly mode: QuantumIDEWorkspaceGraphContextAttachMode;
}

export interface IQuantumIDEWorkspaceGraphContextAttachmentOptions {
	readonly graph: IQuantumIDEWorkspaceGraph;
	readonly generation: number;
	readonly lastAttached?: IQuantumIDEWorkspaceGraphContextAttachState;
	readonly indexingEnabled: boolean;
	readonly preferRoot?: string;
	readonly splitRoots: boolean;
	readonly maxChars: number;
	readonly maxFiles: number;
}

export interface IQuantumIDEWorkspaceGraphContextAttachmentResult {
	readonly primary: string;
	readonly secondary?: string;
	readonly mode: QuantumIDEWorkspaceGraphContextAttachMode;
	readonly generation: number;
	readonly fingerprint: string;
}

const attachStateByWorkspace = new Map<string, IQuantumIDEWorkspaceGraphContextAttachState>();

export function resetQuantumIDEWorkspaceGraphContextAttachStateForTests(): void {
	attachStateByWorkspace.clear();
}

export function getQuantumIDEWorkspaceGraphContextAttachState(
	workspaceId: string,
): IQuantumIDEWorkspaceGraphContextAttachState | undefined {
	return attachStateByWorkspace.get(workspaceId);
}

export function setQuantumIDEWorkspaceGraphContextAttachState(
	workspaceId: string,
	state: IQuantumIDEWorkspaceGraphContextAttachState,
): void {
	attachStateByWorkspace.set(workspaceId, state);
}

export function computeQuantumIDEWorkspaceGraphFingerprint(graph: IQuantumIDEWorkspaceGraph): string {
	const paths = graph.files.map(f => f.workspaceRelativePath);
	const sample = paths.length <= 48
		? paths.join('\n')
		: [...paths.slice(0, 24), '…', ...paths.slice(-24)].join('\n');
	return hashString(`${graph.files.length}:${graph.folders.length}:${sample}:${graph.status.generatedAt ?? ''}`);
}

function hashString(value: string): string {
	let hash = 5381;
	for (let i = 0; i < value.length; i++) {
		hash = ((hash << 5) + hash) ^ value.charCodeAt(i);
	}
	return (hash >>> 0).toString(16);
}

function clip(text: string, maxChars: number): string {
	if (text.length <= maxChars) {
		return text;
	}
	return `${text.slice(0, Math.max(0, maxChars - 80))}\n\n…(workspace graph context clipped at ${maxChars} chars)`;
}

function formatFullWorkspaceGraphLines(
	graph: IQuantumIDEWorkspaceGraph,
	preferRoot?: string,
	maxFiles = 20,
): string[] {
	const lines: string[] = [
		`Summary: ${summarizeQuantumIDEWorkspaceGraph(graph)}`,
		`Generated: ${graph.status.generatedAt ?? 'not generated'} (${graph.status.reason ?? 'unknown reason'})`,
		'Folders:',
		...(graph.folders.length ? graph.folders.map(folder => `- ${folder.name}: ${folder.uri}`) : ['- No workspace folders.']),
		'Projects:',
	];
	if (graph.projects.length === 0) {
		lines.push('- No project manifests detected yet.');
	} else {
		for (const project of graph.projects.slice(0, MAX_PROJECTS_IN_CONTEXT)) {
			lines.push(`- ${project.workspaceRelativePath || project.name} (${project.ecosystem}; manifests: ${project.manifestKinds.join(', ')}${project.frameworks.length ? `; frameworks: ${project.frameworks.join(', ')}` : ''})`);
		}
	}
	lines.push('Key manifests:');
	if (graph.manifests.length === 0) {
		lines.push('- None detected.');
	} else {
		for (const manifest of graph.manifests.slice(0, MAX_MANIFESTS_IN_CONTEXT)) {
			lines.push(`- ${manifest.workspaceRelativePath} (${manifest.kind})`);
		}
	}
	lines.push('Top indexed files:');
	const fileList = preferRoot
		? [
			...graph.files.filter(f => f.workspaceRelativePath.startsWith(`${preferRoot}/`) || f.workspaceRelativePath === preferRoot),
			...graph.files.filter(f => !f.workspaceRelativePath.startsWith(`${preferRoot}/`) && f.workspaceRelativePath !== preferRoot),
		]
		: graph.files;
	for (const file of fileList.slice(0, maxFiles)) {
		lines.push(`- ${file.workspaceRelativePath}`);
	}
	if (fileList.length > maxFiles) {
		lines.push(`- ...${fileList.length - maxFiles} more indexed files omitted.`);
	}
	if (graph.status.perRoot?.length) {
		lines.push('Per-root scan summary:');
		for (const root of graph.status.perRoot) {
			lines.push(`- ${root.folderName}: ${root.filesIndexed} file(s)${root.truncated ? ' (truncated)' : ''}`);
		}
	}
	return lines;
}

function formatOtherRootsLines(graph: IQuantumIDEWorkspaceGraph, preferRoot: string, maxPerRoot: number): string[] {
	const lines: string[] = [];
	for (const folder of graph.folders) {
		if (folder.name === preferRoot) {
			continue;
		}
		const rootFiles = graph.files.filter(f => f.workspaceRelativePath.startsWith(`${folder.name}/`) || f.workspaceRelativePath === folder.name);
		if (rootFiles.length === 0) {
			continue;
		}
		lines.push(`- ${folder.name}:`);
		for (const file of rootFiles.slice(0, maxPerRoot)) {
			lines.push(`  - ${file.workspaceRelativePath}`);
		}
		if (rootFiles.length > maxPerRoot) {
			lines.push(`  - …${rootFiles.length - maxPerRoot} more under ${folder.name}`);
		}
	}
	return lines;
}

function formatCompactWorkspaceGraphBody(
	graph: IQuantumIDEWorkspaceGraph,
	generation: number,
	fingerprint: string,
	preferRoot?: string,
): string {
	const perRoot = graph.status.perRoot?.map(r => `${r.folderName}(${r.filesIndexed}${r.truncated ? ',truncated' : ''})`).join(', ') ?? 'n/a';
	const lines = [
		`Workspace graph unchanged (generation=${generation}; fingerprint=${fingerprint}).`,
		`${summarizeQuantumIDEWorkspaceGraph(graph)}`,
		`Per-root: ${perRoot}.`,
		'Use read_workspace_file, list_workspace_directory, and file_search for paths — full file list omitted on repeat turns (RR-03).',
	];
	if (preferRoot) {
		const rootCount = graph.files.filter(f => f.workspaceRelativePath.startsWith(`${preferRoot}/`)).length;
		lines.push(`Active root "${preferRoot}": ${rootCount} indexed path(s) in graph.`);
	}
	return lines.join('\n');
}

/** RR-03: full graph on first attach per generation; compact hash + summary on repeats. */
export function buildQuantumIDEWorkspaceGraphContextAttachment(
	options: IQuantumIDEWorkspaceGraphContextAttachmentOptions,
): IQuantumIDEWorkspaceGraphContextAttachmentResult {
	const fingerprint = computeQuantumIDEWorkspaceGraphFingerprint(options.graph);
	const useCompact = options.lastAttached !== undefined
		&& options.lastAttached.generation === options.generation
		&& options.lastAttached.fingerprint === fingerprint;
	const header = [...formatQuantumIDEWorkspaceContextHeaders(options.indexingEnabled)];
	const mode: QuantumIDEWorkspaceGraphContextAttachMode = useCompact ? 'compact' : 'full';

	if (useCompact) {
		const compactBody = formatCompactWorkspaceGraphBody(options.graph, options.generation, fingerprint, options.preferRoot);
		if (options.splitRoots && options.preferRoot) {
			const primary = clip([...header, '', `Workspace (root: ${options.preferRoot}):`, compactBody].join('\n'), Math.floor(options.maxChars * 0.65));
			const otherRoots = options.graph.folders.filter(f => f.name !== options.preferRoot);
			const secondary = otherRoots.length
				? clip(
					[
						'Other workspace roots (unchanged):',
						...otherRoots.map(f => `- ${f.name}: unchanged at generation ${options.generation}`),
					].join('\n'),
					Math.floor(options.maxChars * 0.35),
				)
				: undefined;
			return { primary, secondary, mode, generation: options.generation, fingerprint };
		}
		const primary = clip([...header, '', 'Workspace:', compactBody].join('\n'), options.maxChars);
		return { primary, mode, generation: options.generation, fingerprint };
	}

	if (options.splitRoots && options.preferRoot) {
		const primaryLines = [...header, '', `Workspace (root: ${options.preferRoot}):`, ...formatFullWorkspaceGraphLines(options.graph, options.preferRoot, options.maxFiles)];
		const otherLines = formatOtherRootsLines(options.graph, options.preferRoot, 8);
		const primary = clip(primaryLines.join('\n'), Math.floor(options.maxChars * 0.65));
		const secondary = otherLines.length
			? clip(['Other workspace roots (lower priority):', ...otherLines].join('\n'), Math.floor(options.maxChars * 0.35))
			: undefined;
		return { primary, secondary, mode, generation: options.generation, fingerprint };
	}

	const primary = clip(
		[...header, '', 'Workspace:', ...formatFullWorkspaceGraphLines(options.graph, undefined, options.maxFiles)].join('\n'),
		options.maxChars,
	);
	return { primary, mode, generation: options.generation, fingerprint };
}
