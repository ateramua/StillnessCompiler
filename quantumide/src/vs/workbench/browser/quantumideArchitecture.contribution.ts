/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../nls.js';
import { Action2, registerAction2 } from '../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../platform/instantiation/common/instantiation.js';
import { QuantumIDEAICommandId } from '../../platform/quantumide/common/quantumideAISettings.js';
import { QUANTUMIDE_PLATFORM_LAYERS } from '../../platform/quantumide/common/quantumideLayers.js';
import { IQuantumIDEPlatformService } from '../services/quantumide/common/quantumidePlatform.js';
import { INotificationService } from '../../platform/notification/common/notification.js';

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: QuantumIDEAICommandId.ShowPlatformArchitecture,
			title: localize2('quantumide.platform.showArchitecture', 'QuantumIDE: Show Platform Architecture'),
			category: { value: localize('quantumide.ai.category', 'QuantumIDE AI'), original: 'QuantumIDE AI' },
			f1: true,
		});
	}
	override async run(accessor: ServicesAccessor): Promise<void> {
		const platform = accessor.get(IQuantumIDEPlatformService);
		const report = await platform.getArchitectureReport();
		const layerLines = report.layers.map(l => {
			const def = QUANTUMIDE_PLATFORM_LAYERS.find(d => d.id === l.layer);
			return `${def?.title ?? l.layer} [${l.status}]: ${l.detail}`;
		});
		const body = [
			report.summary,
			'',
			'--- Layers ---',
			...layerLines,
			'',
			'--- Technology stack ---',
			report.techStack,
		].join('\n');
		accessor.get(INotificationService).info(body);
	}
});
