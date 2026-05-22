/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import {
	buildQuantumIDEWorkspaceGraphContextAttachment,
	computeQuantumIDEWorkspaceGraphFingerprint,
	QUANTUMIDE_GRAPH_CONTEXT_COMPACT_MIN_REDUCTION,
	resetQuantumIDEWorkspaceGraphContextAttachStateForTests,
} from './quantumideWorkspaceGraphContextAttachment.js';
import { QuantumIDEManifestKind, type IQuantumIDEWorkspaceGraph } from './quantumideWorkspaceGraph.js';

export const QUANTUMIDE_GRAPH_CONTEXT_ATTACHMENT_FIXTURE_FILES = 200;

export function buildQuantumIDEGraphContextAttachmentFixtureGraph(
	fileCount = QUANTUMIDE_GRAPH_CONTEXT_ATTACHMENT_FIXTURE_FILES,
): IQuantumIDEWorkspaceGraph {
	const files = Array.from({ length: fileCount }, (_, i) => ({
		uri: `file:///StillnessCompiler/src/components/pkg${i % 40}/Module${i}.tsx`,
		workspaceRelativePath: `StillnessCompiler/src/components/pkg${i % 40}/Module${i}.tsx`,
		name: `Module${i}.tsx`,
		extension: '.tsx',
	}));
	return {
		version: 1,
		workspaceId: 'graph-context-fixture',
		folders: [{ name: 'StillnessCompiler', uri: 'file:///StillnessCompiler' }],
		projects: [{
			id: 'file:///StillnessCompiler',
			name: 'StillnessCompiler',
			rootUri: 'file:///StillnessCompiler',
			workspaceRelativePath: 'StillnessCompiler',
			ecosystem: 'node',
			manifestKinds: [QuantumIDEManifestKind.PackageJson],
			frameworks: ['typescript'],
		}],
		manifests: [{
			kind: QuantumIDEManifestKind.PackageJson,
			name: 'package.json',
			uri: 'file:///StillnessCompiler/package.json',
			workspaceRelativePath: 'StillnessCompiler/package.json',
			projectPath: 'StillnessCompiler',
		}],
		files,
		status: {
			indexed: true,
			generatedAt: new Date().toISOString(),
			reason: 'fixture',
			perRoot: [{ folderName: 'StillnessCompiler', filesIndexed: fileCount, truncated: fileCount > 120 }],
		},
	};
}

export interface IQuantumIDEGraphContextAttachmentReductionResult {
	readonly fullBytes: number;
	readonly compactBytes: number;
	readonly reductionRatio: number;
	readonly meetsAc0305: boolean;
}

/** AC-03-05: unchanged generation attach is ≥50% smaller than first-turn full attach. */
export function measureQuantumIDEGraphContextAttachmentReduction(
	fileCount = QUANTUMIDE_GRAPH_CONTEXT_ATTACHMENT_FIXTURE_FILES,
): IQuantumIDEGraphContextAttachmentReductionResult {
	resetQuantumIDEWorkspaceGraphContextAttachStateForTests();
	const graph = buildQuantumIDEGraphContextAttachmentFixtureGraph(fileCount);
	const generation = 3;
	const fingerprint = computeQuantumIDEWorkspaceGraphFingerprint(graph);
	const base = {
		graph,
		generation,
		indexingEnabled: false,
		preferRoot: 'StillnessCompiler',
		splitRoots: true,
		maxChars: 14_000,
		maxFiles: 20,
	};
	const full = buildQuantumIDEWorkspaceGraphContextAttachment({ ...base, lastAttached: undefined });
	const compact = buildQuantumIDEWorkspaceGraphContextAttachment({
		...base,
		lastAttached: { generation, fingerprint, mode: 'full' },
	});
	const fullBytes = full.primary.length + (full.secondary?.length ?? 0);
	const compactBytes = compact.primary.length + (compact.secondary?.length ?? 0);
	const reductionRatio = fullBytes > 0 ? 1 - compactBytes / fullBytes : 0;
	return {
		fullBytes,
		compactBytes,
		reductionRatio,
		meetsAc0305: reductionRatio >= QUANTUMIDE_GRAPH_CONTEXT_COMPACT_MIN_REDUCTION,
	};
}
