/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { ipcRenderer } from '../../base/parts/sandbox/electron-browser/globals.js';
import { isNative } from '../../base/common/platform.js';
import { KeyCode, KeyMod } from '../../base/common/keyCodes.js';
import { localize2 } from '../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../platform/actions/common/actions.js';
import { Categories } from '../../platform/action/common/actionCommonCategories.js';
import { ServicesAccessor } from '../../platform/instantiation/common/instantiation.js';
import { INativeHostService } from '../../platform/native/common/native.js';
import product from '../../platform/product/common/product.js';
import { isQuantumIDEBuild } from '../../platform/quantumide/common/quantumideChatPlatform.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../platform/keybinding/common/keybindingsRegistry.js';

function isQuantumIDE(): boolean {
	return isQuantumIDEBuild(product);
}

async function toggleDevToolsReliable(nativeHost: INativeHostService): Promise<void> {
	try {
		await nativeHost.toggleDevTools();
	} catch {
		// fall through to preload IPC
	}
	ipcRenderer.send('vscode:toggleDevTools');
}

if (isNative && isQuantumIDE()) {
	const devtoolsKeybinding = {
		weight: KeybindingWeight.WorkbenchContrib + 200,
		primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyI,
		mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyI },
	};

	KeybindingsRegistry.registerKeybindingRule({
		id: 'workbench.action.toggleDevTools',
		...devtoolsKeybinding,
	});

	KeybindingsRegistry.registerKeybindingRule({
		id: 'quantumide.action.toggleDevTools',
		...devtoolsKeybinding,
	});

	KeybindingsRegistry.registerKeybindingRule({
		id: 'quantumide.action.toggleDevTools',
		weight: KeybindingWeight.WorkbenchContrib + 200,
		primary: KeyCode.F12,
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'quantumide.action.toggleDevTools',
				title: localize2('quantumide.toggleDevTools', 'QuantumIDE: Toggle Developer Tools'),
				category: Categories.Developer,
				f1: true,
				keybinding: {
					...devtoolsKeybinding,
				},
				menu: [
					{ id: MenuId.MenubarHelpMenu, group: '5_tools', order: 0 },
					{ id: MenuId.MenubarViewMenu, group: '5_tools', order: 0 },
				],
			});
		}
		override async run(accessor: ServicesAccessor): Promise<void> {
			await toggleDevToolsReliable(accessor.get(INativeHostService));
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'quantumide.action.openDevTools',
				title: localize2('quantumide.openDevTools', 'QuantumIDE: Open Developer Tools'),
				category: Categories.Developer,
				f1: true,
			});
		}
		override async run(accessor: ServicesAccessor): Promise<void> {
			const nativeHost = accessor.get(INativeHostService);
			try {
				await nativeHost.openDevTools({ mode: 'detach', activate: true });
			} catch {
				await toggleDevToolsReliable(nativeHost);
			}
		}
	});
}
