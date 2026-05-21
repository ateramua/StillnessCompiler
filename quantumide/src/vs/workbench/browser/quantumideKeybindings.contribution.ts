/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../nls.js';
import { Action2, registerAction2 } from '../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../platform/instantiation/common/instantiation.js';
import { QuantumIDEAICommandId } from '../../platform/quantumide/common/quantumideAISettings.js';
import { detectQuantumIDEKeybindingConflicts } from '../../platform/quantumide/common/quantumideKeybindingConflicts.js';
import { INotificationService } from '../../platform/notification/common/notification.js';
import { ICommandService } from '../../platform/commands/common/commands.js';
import { IKeybindingService } from '../../platform/keybinding/common/keybinding.js';

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: QuantumIDEAICommandId.DetectKeybindingConflicts,
			title: localize2('quantumide.settings.detectKeybindingConflicts', 'QuantumIDE: Detect Keybinding Conflicts'),
			category: { value: localize('quantumide.settings.category', 'QuantumIDE Settings'), original: 'QuantumIDE Settings' },
			f1: true,
		});
	}
	override async run(accessor: ServicesAccessor): Promise<void> {
		const keybindingService = accessor.get(IKeybindingService);
		const notificationService = accessor.get(INotificationService);
		const commandService = accessor.get(ICommandService);
		const conflicts = detectQuantumIDEKeybindingConflicts(keybindingService.getKeybindings());
		if (conflicts.length === 0) {
			notificationService.info(localize(
				'quantumide.keybindings.noConflicts',
				'No QuantumIDE keybinding conflicts detected. Assign shortcuts in Keyboard Shortcuts (filtered to QuantumIDE commands).',
			));
		} else {
			const lines = conflicts.slice(0, 12).map(conflict => {
				const tag = conflict.reason === 'user-override'
					? localize('quantumide.keybindings.userOverride', 'user override')
					: localize('quantumide.keybindings.quantumideOverlap', 'QuantumIDE overlap');
				return `${conflict.chord} (${tag}): ${conflict.commands.join(', ')}`;
			});
			notificationService.warn([
				localize('quantumide.keybindings.conflicts', 'QuantumIDE keybinding conflicts:'),
				...lines,
			].join('\n'));
		}
		await commandService.executeCommand('workbench.action.openGlobalKeybindings', 'quantumide');
	}
});
