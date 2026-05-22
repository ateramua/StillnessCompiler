/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import type { QuantumIDEAgentPipeline } from './quantumideAgentPipeline.js';

/** AC-03-01 telemetry key (privacy-safe aggregate). */
export const QuantumIDEAgentPipelineTelemetryKey = 'qide.agent.pipeline';

let _lastPipeline: QuantumIDEAgentPipeline | undefined;
const _pipelineCounts: Record<QuantumIDEAgentPipeline, number> = {
	lite: 0,
	standard: 0,
	full: 0,
};

/** AC-03-02: semantic index tool invocations (inner search path only). */
let _semanticWorkspaceInvocationCount = 0;
let _litePipelineSemanticToolBlockCount = 0;

export function recordQuantumIDEAgentPipeline(pipeline: QuantumIDEAgentPipeline): void {
	_lastPipeline = pipeline;
	_pipelineCounts[pipeline]++;
}

export function getQuantumIDEAgentPipelineTelemetry(): Readonly<Record<string, string>> {
	return _lastPipeline ? { [QuantumIDEAgentPipelineTelemetryKey]: _lastPipeline } : {};
}

export function getQuantumIDEAgentPipelineTelemetryCounters(): Readonly<Record<QuantumIDEAgentPipeline, number>> {
	return { ..._pipelineCounts };
}

export function recordQuantumIDESemanticWorkspaceToolInvocation(): void {
	_semanticWorkspaceInvocationCount++;
}

export function recordQuantumIDELitePipelineSemanticToolBlock(): void {
	_litePipelineSemanticToolBlockCount++;
}

export function getQuantumIDESemanticWorkspaceToolInvocationCount(): number {
	return _semanticWorkspaceInvocationCount;
}

export function getQuantumIDELitePipelineSemanticToolBlockCount(): number {
	return _litePipelineSemanticToolBlockCount;
}

export function resetQuantumIDEAgentPipelineTelemetryForTests(): void {
	_lastPipeline = undefined;
	_pipelineCounts.lite = 0;
	_pipelineCounts.standard = 0;
	_pipelineCounts.full = 0;
	_semanticWorkspaceInvocationCount = 0;
	_litePipelineSemanticToolBlockCount = 0;
}
