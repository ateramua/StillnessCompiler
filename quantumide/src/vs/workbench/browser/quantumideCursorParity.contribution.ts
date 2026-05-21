/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../base/common/lifecycle.js';
import { localize, localize2 } from '../../nls.js';
import { Action2, registerAction2 } from '../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../platform/configuration/common/configuration.js';
import { ServicesAccessor } from '../../platform/instantiation/common/instantiation.js';
import { INotificationService, Severity } from '../../platform/notification/common/notification.js';
import { IQuickInputService } from '../../platform/quickinput/common/quickInput.js';
import { isQuantumIDEProduct } from '../../platform/quantumide/common/quantumideChatPlatform.js';
import { QuantumIDEAICommandId, QuantumIDEAISettingId } from '../../platform/quantumide/common/quantumideAISettings.js';
import product from '../../platform/product/common/product.js';
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from '../common/contributions.js';
import { IQuantumIDECollaborationService } from '../services/quantumide/common/quantumideCollaboration.js';
import { IQuantumIDESecretScannerService } from '../services/quantumide/common/quantumideSecretScanner.js';
import { IQuantumIDEChatEditSessionService } from '../services/quantumide/browser/quantumideChatEditSessionService.js';
import { IQuantumIDEUnifiedSearchService } from '../services/quantumide/common/quantumidePlatformOps.js';
import { IQuantumIDEFileNavigationService } from '../services/quantumide/browser/quantumideFileNavigationService.js';
import { IQuantumIDEBackgroundIndexerService } from '../services/quantumide/browser/quantumideBackgroundIndexerService.js';

function isQuantumIDE(): boolean {
	return isQuantumIDEProduct(product.applicationName)
		|| [product.nameShort, product.nameLong].some(n => typeof n === 'string' && n.toLowerCase().includes('quantumide'));
}

class QuantumIDECursorParityBootstrapContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.quantumideCursorParityBootstrap';

	constructor(
		@IConfigurationService configuration: IConfigurationService,
		@IQuantumIDEBackgroundIndexerService indexer: IQuantumIDEBackgroundIndexerService,
	) {
		super();
		if (!isQuantumIDE() || configuration.getValue<boolean>(QuantumIDEAISettingId.ChatCursorParityEnabled) === false) {
			return;
		}
		indexer.scheduleBackgroundRefresh('cursor-parity-bootstrap');
	}
}

if (isQuantumIDE()) {
	registerWorkbenchContribution2(QuantumIDECursorParityBootstrapContribution.ID, QuantumIDECursorParityBootstrapContribution, WorkbenchPhase.AfterRestored);

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'quantumide.chat.rejectAllPending',
				title: localize2('quantumide.chat.rejectAllPending', 'QuantumIDE: Reject All Pending Chat Edits'),
				category: { value: localize('quantumide.cursorParity', 'QuantumIDE Cursor Parity'), original: 'QuantumIDE Cursor Parity' },
				f1: true,
			});
		}
		override run(accessor: ServicesAccessor): void {
			accessor.get(IQuantumIDEChatEditSessionService).rejectAll();
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: QuantumIDEAICommandId.CollabConnectRelay,
				title: localize2('quantumide.collab.connectRelay', 'QuantumIDE: Connect Collaboration Relay'),
				category: { value: localize('quantumide.cursorParity', 'QuantumIDE Cursor Parity'), original: 'QuantumIDE Cursor Parity' },
				f1: true,
			});
		}
		override async run(accessor: ServicesAccessor): Promise<void> {
			const url = await accessor.get(IQuickInputService).input({
				title: localize('quantumide.collab.relayUrl', 'WebSocket relay URL (ws://…)'),
				value: accessor.get(IQuantumIDECollaborationService).getRelayUrl() ?? 'ws://127.0.0.1:3928',
			});
			if (!url) {
				return;
			}
			try {
				await accessor.get(IQuantumIDECollaborationService).connectRelay(url);
				accessor.get(INotificationService).info(localize('quantumide.collab.relayConnected', 'Collaboration relay connected.'));
			} catch (err) {
				accessor.get(INotificationService).notify({ severity: Severity.Error, message: String(err) });
			}
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: QuantumIDEAICommandId.CollabDisconnectRelay,
				title: localize2('quantumide.collab.disconnectRelay', 'QuantumIDE: Disconnect Collaboration Relay'),
				category: { value: localize('quantumide.cursorParity', 'QuantumIDE Cursor Parity'), original: 'QuantumIDE Cursor Parity' },
				f1: true,
			});
		}
		override run(accessor: ServicesAccessor): void {
			accessor.get(IQuantumIDECollaborationService).disconnectRelay();
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: QuantumIDEAICommandId.SecurityScanWorkspace,
				title: localize2('quantumide.security.scan', 'QuantumIDE: Scan Workspace for Secrets'),
				category: { value: localize('quantumide.cursorParity', 'QuantumIDE Cursor Parity'), original: 'QuantumIDE Cursor Parity' },
				f1: true,
			});
		}
		override async run(accessor: ServicesAccessor): Promise<void> {
			const hits = await accessor.get(IQuantumIDESecretScannerService).scanWorkspace(30);
			if (hits.length === 0) {
				accessor.get(INotificationService).info(localize('quantumide.security.none', 'No high-signal secrets detected in workspace scan.'));
				return;
			}
			const body = hits.map(h => `${h.path}:${h.line} [${h.rule}] ${h.snippet}`).join('\n');
			accessor.get(INotificationService).notify({ severity: Severity.Warning, message: body.slice(0, 8000) });
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: QuantumIDEAICommandId.ChatPanelUnifiedSearch,
				title: localize2('quantumide.chatPanel.search', 'QuantumIDE: Search in Chat Panel'),
				category: { value: localize('quantumide.cursorParity', 'QuantumIDE Cursor Parity'), original: 'QuantumIDE Cursor Parity' },
				f1: true,
			});
		}
		override async run(accessor: ServicesAccessor): Promise<void> {
			const q = await accessor.get(IQuickInputService).input({ title: localize('quantumide.search.unifiedTitle', 'Search codebase') });
			if (!q) {
				return;
			}
			const hits = await accessor.get(IQuantumIDEUnifiedSearchService).search(q, 25);
			const picked = await accessor.get(IQuickInputService).pick(
				hits.map(h => ({ label: h.label, description: h.path, detail: h.detail, hit: h })),
				{ placeHolder: localize('quantumide.search.results', 'Search results') },
			);
			if (picked && 'hit' in picked) {
				const h = picked.hit as import('../services/quantumide/common/quantumidePlatformOps.js').IQuantumIDEUnifiedSearchHit;
				await accessor.get(IQuantumIDEFileNavigationService).openFile(h.path, h.line);
			}
		}
	});
}
