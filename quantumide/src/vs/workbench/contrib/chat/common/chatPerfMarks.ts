/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Chat performance mark names (shared by chatPerf + chatPerfInstrumentation).
 * Kept in a leaf module to avoid circular imports.
 */
export const ChatPerfMark = {
	RequestStart: 'request/start',
	/** QuantumIDE workspace discovery / chat context orchestrator (OBS-01). */
	ContextBuildWillStart: 'context/buildWillStart',
	ContextBuildDidComplete: 'context/buildDidComplete',
	RequestUiUpdated: 'request/uiUpdated',
	WillCollectInstructions: 'request/willCollectInstructions',
	DidCollectInstructions: 'request/didCollectInstructions',
	ApiRequestSent: 'request/apiSent',
	FirstToken: 'request/firstToken',
	StreamChunkReceived: 'stream/chunkReceived',
	RequestComplete: 'request/complete',
	AgentWillInvoke: 'agent/willInvoke',
	AgentDidInvoke: 'agent/didInvoke',
	ChunkRendered: 'render/chunk',
	MessageRenderComplete: 'render/messageComplete',
	UiReflowComplete: 'render/uiReflow',
} as const;

export const ChatGlobalPerfMark = {
	WillWaitForActivation: 'willWaitForActivation',
	DidWaitForActivation: 'didWaitForActivation',
} as const;
