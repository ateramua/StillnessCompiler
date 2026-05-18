/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { QuantumIDEAIProvider, QuantumIDEAISettingId } from './quantumideAISettings.js';

export interface IQuantumIDEModelRoute {
	readonly id: string;
	readonly provider: QuantumIDEAIProvider | string;
	readonly model: string;
	readonly displayName?: string;
	readonly baseUrl?: string;
	readonly tier?: string;
	readonly enabled?: boolean;
}

export const QuantumIDEModelRouterConfigKey = QuantumIDEAISettingId.ModelRouterRoutes;

export const defaultQuantumIDEModelRoutes: readonly IQuantumIDEModelRoute[] = [
	{ id: 'openai.gpt-4.1', provider: QuantumIDEAIProvider.OpenAI, model: 'gpt-4.1', displayName: 'GPT-4.1', tier: 'standard', enabled: true },
	{ id: 'openai.gpt-4.1-mini', provider: QuantumIDEAIProvider.OpenAI, model: 'gpt-4.1-mini', displayName: 'GPT-4.1 mini', tier: 'fast', enabled: true },
	{ id: 'openai.gpt-4o', provider: QuantumIDEAIProvider.OpenAI, model: 'gpt-4o', displayName: 'GPT-4o', tier: 'vision', enabled: true },
];

export function sanitizeQuantumIDEModelRoutes(routes: unknown, fallback: readonly IQuantumIDEModelRoute[] = defaultQuantumIDEModelRoutes): IQuantumIDEModelRoute[] {
	const rawRoutes = Array.isArray(routes) ? routes : fallback;
	const seen = new Set<string>();
	const sanitized: IQuantumIDEModelRoute[] = [];
	for (const route of rawRoutes) {
		if (!route || typeof route !== 'object') {
			continue;
		}
		const candidate = route as Partial<IQuantumIDEModelRoute>;
		const id = typeof candidate.id === 'string' ? candidate.id.trim() : '';
		const provider = typeof candidate.provider === 'string' ? candidate.provider.trim() : '';
		const model = typeof candidate.model === 'string' ? candidate.model.trim() : '';
		if (!id || !provider || !model || seen.has(id)) {
			continue;
		}
		seen.add(id);
		sanitized.push({
			id,
			provider,
			model,
			...(typeof candidate.displayName === 'string' && candidate.displayName.trim() ? { displayName: candidate.displayName.trim() } : {}),
			...(typeof candidate.baseUrl === 'string' && candidate.baseUrl.trim() ? { baseUrl: candidate.baseUrl.trim() } : {}),
			...(typeof candidate.tier === 'string' && candidate.tier.trim() ? { tier: candidate.tier.trim() } : {}),
			enabled: candidate.enabled !== false,
		});
	}
	return sanitized.length > 0 ? sanitized : [...fallback];
}

export function enabledQuantumIDEModelRoutes(routes: unknown, provider?: string): IQuantumIDEModelRoute[] {
	return sanitizeQuantumIDEModelRoutes(routes).filter(route => route.enabled !== false && (!provider || route.provider === provider));
}
