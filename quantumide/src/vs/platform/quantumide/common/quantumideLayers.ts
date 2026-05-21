/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/** §4.1 layered architecture identifiers. */
export const enum QuantumIDEPlatformLayer {
	UI = 'ui',
	Context = 'context',
	Agent = 'agent',
	Execution = 'execution',
	Diff = 'diff',
	Storage = 'storage',
	ModelGateway = 'modelGateway',
}

export interface IQuantumIDEPlatformLayerDefinition {
	readonly id: QuantumIDEPlatformLayer;
	readonly title: string;
	readonly responsibility: string;
	readonly primaryModules: readonly string[];
}

export const QUANTUMIDE_PLATFORM_LAYERS: readonly IQuantumIDEPlatformLayerDefinition[] = [
	{
		id: QuantumIDEPlatformLayer.UI,
		title: 'UI Layer',
		responsibility: 'Editor, chat panel, inline AI, and settings surfaces.',
		primaryModules: [
			'workbench/contrib/chat',
			'quantumideSettingsPanel.contribution',
			'quantumideInlineDiff',
			'quantumideChatPlatform.contribution',
		],
	},
	{
		id: QuantumIDEPlatformLayer.Context,
		title: 'Context Layer',
		responsibility: 'Retrieval, indexing, ranking, and workspace context assembly.',
		primaryModules: [
			'quantumideChatContextOrchestrator',
			'quantumideSemanticIndexService',
			'quantumideContextRanker',
			'openaiHostTools (retrieval)',
		],
	},
	{
		id: QuantumIDEPlatformLayer.Agent,
		title: 'Agent Layer',
		responsibility: 'Task orchestration, tool loops, lifecycle phases, and handoffs.',
		primaryModules: [
			'agentHostSessionHandler',
			'openAiAgent',
			'quantumideChatPlatform (lifecycle)',
		],
	},
	{
		id: QuantumIDEPlatformLayer.Execution,
		title: 'Execution Layer',
		responsibility: 'Terminal runtime, command approval, and workspace checks.',
		primaryModules: [
			'terminal integration',
			'run_workspace_check host tool',
			'quantumideTerminalAnalysis',
		],
	},
	{
		id: QuantumIDEPlatformLayer.Diff,
		title: 'Diff Layer',
		responsibility: 'Patch management, hunks, inline diff, and coordinated edits.',
		primaryModules: [
			'quantumideWorkspaceEdits',
			'quantumideDiffHunks',
			'quantumideInlineDiffService',
			'quantumideEditEngine',
		],
	},
	{
		id: QuantumIDEPlatformLayer.Storage,
		title: 'Storage Layer',
		responsibility: 'Sessions, checkpoints, `.quantumide` caches, and event state.',
		primaryModules: [
			'openAiAgent transcripts',
			'quantumideWorkspacePatches',
			'quantumideEventStateStore',
		],
	},
	{
		id: QuantumIDEPlatformLayer.ModelGateway,
		title: 'Model Gateway',
		responsibility: 'Provider routing, fallbacks, and task-specific model selection.',
		primaryModules: [
			'quantumideModelRouter',
			'openAiAgent model resolution',
		],
	},
];

export interface IQuantumIDELayerHealth {
	readonly layer: QuantumIDEPlatformLayer;
	readonly status: 'ready' | 'degraded' | 'unavailable';
	readonly detail: string;
}
