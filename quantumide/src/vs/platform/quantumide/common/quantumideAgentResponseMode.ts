/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import type { QuantumIDEAgentPipeline } from './quantumideAgentPipeline.js';

/** Req-09: explicit fast vs safe agent response modes. */
export type QuantumIDEAgentResponseMode = 'fast' | 'safe' | 'auto';

export interface IQuantumIDEAgentResponseModeProfile {
	readonly mode: QuantumIDEAgentResponseMode;
	readonly maxToolIterations: number;
	readonly verifyOnEdit: boolean;
	readonly allowFastLane: boolean;
	readonly planningDepth: 'minimal' | 'standard' | 'deep';
}

export function resolveQuantumIDEAgentResponseMode(
	configured: string | undefined,
	pipeline: QuantumIDEAgentPipeline,
): QuantumIDEAgentResponseMode {
	if (configured === 'fast' || configured === 'safe') {
		return configured;
	}
	if (pipeline === 'lite') {
		return 'fast';
	}
	return 'safe';
}

export function profileForQuantumIDEAgentResponseMode(
	mode: QuantumIDEAgentResponseMode,
	pipeline: QuantumIDEAgentPipeline,
): IQuantumIDEAgentResponseModeProfile {
	const effective = mode === 'auto' ? resolveQuantumIDEAgentResponseMode(undefined, pipeline) : mode;
	if (effective === 'fast') {
		return {
			mode: 'fast',
			maxToolIterations: pipeline === 'lite' ? 4 : 8,
			verifyOnEdit: false,
			allowFastLane: true,
			planningDepth: 'minimal',
		};
	}
	return {
		mode: 'safe',
		maxToolIterations: pipeline === 'lite' ? 6 : 24,
		verifyOnEdit: true,
		allowFastLane: false,
		planningDepth: pipeline === 'full' ? 'deep' : 'standard',
	};
}

export function formatQuantumIDEAgentResponseModeLabel(mode: QuantumIDEAgentResponseMode): string {
	switch (mode) {
		case 'fast': return 'Fast (minimal verification, shallow context)';
		case 'safe': return 'Safe (full verification, deep context)';
		default: return 'Auto (lite→fast, full→safe)';
	}
}
