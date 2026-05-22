/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { QUANTUMIDE_RULES_DIR } from './agentVelocity.js';

export const CURSOR_RULES_DIR = '.cursor/rules';
export const CURSOR_IGNORE_FILE = '.cursorignore';

export type QuantumIDERuleActivation = 'always' | 'auto' | 'manual' | 'agent';

export interface IQuantumIDEChatRule {
	readonly path: string;
	readonly activation: QuantumIDERuleActivation;
	readonly globs: readonly string[];
	readonly content: string;
}

export interface IQuantumIDEChatRulesSelection {
	readonly always: readonly IQuantumIDEChatRule[];
	readonly auto: readonly IQuantumIDEChatRule[];
	readonly manual: readonly IQuantumIDEChatRule[];
	readonly agent: readonly IQuantumIDEChatRule[];
}

export function parseQuantumIDERuleFrontmatter(raw: string): { activation: QuantumIDERuleActivation; globs: string[]; body: string } {
	const trimmed = raw.trimStart();
	if (!trimmed.startsWith('---')) {
		return { activation: 'always', globs: [], body: raw };
	}
	const end = trimmed.indexOf('---', 3);
	if (end === -1) {
		return { activation: 'always', globs: [], body: raw };
	}
	const front = trimmed.slice(3, end);
	const body = trimmed.slice(end + 3).trim();
	let activation: QuantumIDERuleActivation = 'always';
	const globs: string[] = [];
	for (const line of front.split(/\r?\n/)) {
		const m = line.match(/^\s*([a-zA-Z0-9_-]+)\s*:\s*(.+)\s*$/);
		if (!m) {
			continue;
		}
		const key = m[1].toLowerCase();
		const value = m[2].trim().replace(/^['"]|['"]$/g, '');
		if (key === 'alwaysapply' || key === 'always_apply') {
			activation = value === 'true' ? 'always' : activation;
		} else if (key === 'description' && value.toLowerCase().includes('manual')) {
			activation = 'manual';
		} else if (key === 'globs' || key === 'glob') {
			globs.push(...value.split(',').map(g => g.trim()).filter(Boolean));
			if (globs.length) {
				activation = 'auto';
			}
		} else if (key === 'activation' || key === 'type') {
			const v = value.toLowerCase();
			if (v === 'always' || v === 'auto' || v === 'manual' || v === 'agent') {
				activation = v;
			}
		}
	}
	if (globs.length && activation === 'always') {
		activation = 'auto';
	}
	return { activation, globs, body };
}

export function ruleMatchesActiveFiles(rule: IQuantumIDEChatRule, activeRelativePaths: readonly string[]): boolean {
	if (rule.activation !== 'auto' || rule.globs.length === 0) {
		return false;
	}
	for (const path of activeRelativePaths) {
		for (const glob of rule.globs) {
			if (matchSimpleGlob(path, glob)) {
				return true;
			}
		}
	}
	return false;
}

function matchSimpleGlob(path: string, glob: string): boolean {
	const normalized = path.replace(/\\/g, '/');
	const g = glob.replace(/\\/g, '/');
	if (g.includes('**')) {
		const parts = g.split('**');
		return normalized.includes(parts[0]?.replace(/^\//, '') ?? '') || normalized.endsWith(parts[1]?.replace(/^\//, '') ?? '');
	}
	if (g.startsWith('*.')) {
		return normalized.endsWith(g.slice(1));
	}
	return normalized === g || normalized.endsWith(`/${g}`) || normalized.includes(g);
}

export function selectQuantumIDEChatRules(
	rules: readonly IQuantumIDEChatRule[],
	activeRelativePaths: readonly string[],
	manualRulePaths?: readonly string[],
): IQuantumIDEChatRulesSelection {
	const always: IQuantumIDEChatRule[] = [];
	const auto: IQuantumIDEChatRule[] = [];
	const manual: IQuantumIDEChatRule[] = [];
	const agent: IQuantumIDEChatRule[] = [];
	const manualSet = new Set((manualRulePaths ?? []).map(p => p.replace(/\\/g, '/')));
	for (const rule of rules) {
		switch (rule.activation) {
			case 'always':
				always.push(rule);
				break;
			case 'auto':
				if (ruleMatchesActiveFiles(rule, activeRelativePaths)) {
					auto.push(rule);
				}
				break;
			case 'manual':
				if (manualSet.has(rule.path) || [...manualSet].some(m => rule.path.endsWith(m))) {
					manual.push(rule);
				}
				break;
			case 'agent':
				agent.push(rule);
				break;
		}
	}
	return { always, auto, manual, agent };
}

export function formatQuantumIDEChatRulesForContext(selection: IQuantumIDEChatRulesSelection, maxChars = 12_000): string {
	const parts: string[] = [];
	const append = (title: string, rules: readonly IQuantumIDEChatRule[]) => {
		if (!rules.length) {
			return;
		}
		parts.push(`### ${title}`);
		for (const rule of rules) {
			parts.push(`#### ${rule.path}`, rule.content);
		}
	};
	append('Always rules', selection.always);
	append('Auto rules (matched active files)', selection.auto);
	append('Manual rules', selection.manual);
	append('Agent-selectable rules', selection.agent);
	return parts.join('\n\n').slice(0, maxChars);
}

export const QUANTUMIDE_RULES_SEARCH_DIRS = [QUANTUMIDE_RULES_DIR, CURSOR_RULES_DIR] as const;
