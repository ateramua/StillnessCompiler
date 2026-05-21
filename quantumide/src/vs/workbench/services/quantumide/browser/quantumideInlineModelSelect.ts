/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { QuantumIDEAISettingId } from '../../../../platform/quantumide/common/quantumideAISettings.js';
import { resolveQuantumIDEModelRoute, QuantumIDEModelRouterConfigKey, type QuantumIDEModelTaskKind } from '../../../../platform/quantumide/common/quantumideModelRouter.js';
import { ILanguageModelsService } from '../../../contrib/chat/common/languageModels.js';

/** Resolves a language model id for a QuantumIDE task route (§2.5, §3). */
export async function selectQuantumIDELanguageModelForTask(
	languageModelsService: ILanguageModelsService,
	configurationService: IConfigurationService,
	task: QuantumIDEModelTaskKind,
): Promise<string | undefined> {
	const route = resolveQuantumIDEModelRoute(
		configurationService.getValue(QuantumIDEModelRouterConfigKey),
		{
			task,
			taskRoutes: configurationService.getValue<Record<string, string>>(QuantumIDEAISettingId.ModelTaskRoutes),
			fallbackRouteId: configurationService.getValue<string>(QuantumIDEAISettingId.ModelFallbackRoute),
		},
	);
	if (!route) {
		const any = languageModelsService.getLanguageModelIds();
		return any[0];
	}
	const vendors = route.provider === 'openai' ? ['openai', 'copilot'] : [route.provider, 'copilot', 'openai'];
	for (const vendor of vendors) {
		const ids = await languageModelsService.selectLanguageModels({ vendor });
		const match = ids.find(id => {
			const meta = languageModelsService.lookupLanguageModel(id);
			return id.includes(route.model) || meta?.id === route.model || meta?.name === route.model;
		});
		if (match) {
			return match;
		}
		if (ids[0]) {
			return ids[0];
		}
	}
	return languageModelsService.getLanguageModelIds()[0];
}
