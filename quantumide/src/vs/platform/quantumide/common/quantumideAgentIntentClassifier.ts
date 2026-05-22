/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import {
	pipelineForQuantumIDEAgentIntent,
	type QuantumIDEAgentIntent,
	type QuantumIDEAgentPipeline,
	type QuantumIDEAgentPipelineMode,
} from './quantumideAgentPipeline.js';

export interface IQuantumIDEAgentIntentClassification {
	readonly intent: QuantumIDEAgentIntent;
	readonly pipeline: QuantumIDEAgentPipeline;
	readonly confidence: 'high' | 'low';
}

/** AC-03-03: @codebase in message or `quantumide.codebase` attachment → Full pipeline. */
export const QUANTUMIDE_CODEBASE_PIPELINE_PATTERN = /@codebase\b/i;

export const QUANTUMIDE_CODEBASE_VARIABLE_IDS = new Set(['quantumide.codebase', 'codebase']);

const FULL_SIGNAL_PATTERNS: readonly RegExp[] = [
	QUANTUMIDE_CODEBASE_PIPELINE_PATTERN,
	/\bsearch_semantic_workspace\b/i,
	/\bsemantic\s+(search|index)\b/i,
];

const EDIT_SIGNAL_PATTERNS: readonly RegExp[] = [
	/\b(fix|refactor|implement|add|create|delete|remove|rename|patch|edit|modify|update|write)\b/i,
	/\bapply_workspace_edits\b/i,
];

const FS_SIMPLE_PATTERNS: readonly RegExp[] = [
	/\b(does|do)\s+[`'"]?.+[`'"]?\s+exist\b/i,
	/\b(is|are)\s+[`'"]?.+[`'"]?\s+(a\s+file|present|there)\b/i,
	/\bcheck\s+if\s+[`'"]?.+[`'"]?\s+exists?\b/i,
	/\b(file|path)\s+[`'"]?.+[`'"]?\s+exists?\b/i,
	/\bexists?\s+in\s+(the\s+)?(repo|workspace|project)\b/i,
	/\b(list|show)\s+(the\s+)?(files\s+in|directory|folder|dir)\b/i,
	/\bwhere\s+is\s+[`'"]?.+[`'"]?\s*\??\s*$/i,
	/\bread\s+(the\s+)?(file|path)\b/i,
];

const SEARCH_ONLY_PATTERNS: readonly RegExp[] = [
	/\b(grep|ripgrep|rg)\b/i,
	/\bfind\s+all\b/i,
	/\bsearch\s+(the\s+)?(repo|workspace|codebase)\s+for\b/i,
	/\bsearch_workspace_text\b/i,
];

const EXPLAIN_PATTERNS: readonly RegExp[] = [
	/\b(explain|describe|summarize)\b/i,
	/\b(why|how)\s+does\b/i,
	/\bwhat\s+does\b/i,
];

export function hasQuantumIDECodebasePipelineSignal(userMessage: string, hasCodebaseAttachment = false): boolean {
	if (hasCodebaseAttachment) {
		return true;
	}
	return QUANTUMIDE_CODEBASE_PIPELINE_PATTERN.test(userMessage.trim());
}

export function chatVariablesHaveQuantumIDECodebaseAttachment(
	variables: readonly { readonly id?: string; readonly name?: string }[] | undefined,
): boolean {
	return variables?.some(v => QUANTUMIDE_CODEBASE_VARIABLE_IDS.has(v.id ?? '') || v.name === 'codebase') ?? false;
}

export function classifyQuantumIDEAgentIntent(userMessage: string): IQuantumIDEAgentIntentClassification {
	const text = userMessage.trim();
	if (!text) {
		return { intent: 'full', pipeline: 'full', confidence: 'low' };
	}
	if (FULL_SIGNAL_PATTERNS.some(p => p.test(text))) {
		return { intent: 'full', pipeline: 'full', confidence: 'high' };
	}
	if (EDIT_SIGNAL_PATTERNS.some(p => p.test(text))) {
		return { intent: 'edit', pipeline: pipelineForQuantumIDEAgentIntent('edit'), confidence: 'high' };
	}
	if (FS_SIMPLE_PATTERNS.some(p => p.test(text))) {
		return { intent: 'fs_simple', pipeline: 'lite', confidence: 'high' };
	}
	if (SEARCH_ONLY_PATTERNS.some(p => p.test(text))) {
		return { intent: 'search_only', pipeline: 'standard', confidence: 'high' };
	}
	if (EXPLAIN_PATTERNS.some(p => p.test(text))) {
		return { intent: 'explain', pipeline: 'full', confidence: 'low' };
	}
	return { intent: 'full', pipeline: 'full', confidence: 'low' };
}

export function resolveQuantumIDEAgentPipeline(
	classification: IQuantumIDEAgentIntentClassification,
	pipelineMode: QuantumIDEAgentPipelineMode | string | undefined,
): QuantumIDEAgentPipeline {
	if (pipelineMode === 'lite') {
		return 'lite';
	}
	if (pipelineMode === 'full') {
		return 'full';
	}
	return classification.pipeline;
}

export function resolveQuantumIDEAgentPipelineForTurn(
	userMessage: string,
	pipelineMode: QuantumIDEAgentPipelineMode | string | undefined,
	attachmentPipeline?: string,
	options?: { readonly hasCodebaseAttachment?: boolean },
): { readonly classification: IQuantumIDEAgentIntentClassification; readonly pipeline: QuantumIDEAgentPipeline } {
	if (hasQuantumIDECodebasePipelineSignal(userMessage, options?.hasCodebaseAttachment)) {
		return {
			classification: { intent: 'full', pipeline: 'full', confidence: 'high' },
			pipeline: 'full',
		};
	}
	if (pipelineMode === 'lite') {
		const classification = classifyQuantumIDEAgentIntent(userMessage);
		return { classification, pipeline: 'lite' };
	}
	if (pipelineMode === 'full') {
		const classification = classifyQuantumIDEAgentIntent(userMessage);
		return { classification, pipeline: 'full' };
	}
	if (attachmentPipeline === 'lite' || attachmentPipeline === 'standard' || attachmentPipeline === 'full') {
		const classification = classifyQuantumIDEAgentIntent(userMessage);
		return { classification, pipeline: attachmentPipeline };
	}
	const classification = classifyQuantumIDEAgentIntent(userMessage);
	return {
		classification,
		pipeline: resolveQuantumIDEAgentPipeline(classification, pipelineMode),
	};
}
