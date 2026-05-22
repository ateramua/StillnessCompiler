/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../base/common/buffer.js';
import { joinPath } from '../../base/common/resources.js';
import { localize, localize2 } from '../../nls.js';
import { Action2, registerAction2 } from '../../platform/actions/common/actions.js';
import { IFileService } from '../../platform/files/common/files.js';
import { ServicesAccessor } from '../../platform/instantiation/common/instantiation.js';
import { QuantumIDEAICommandId } from '../../platform/quantumide/common/quantumideAISettings.js';
import { isQuantumIDEBuild } from '../../platform/quantumide/common/quantumideChatPlatform.js';
import product from '../../platform/product/common/product.js';
import { INotificationService } from '../../platform/notification/common/notification.js';
import { IWorkspaceContextService } from '../../platform/workspace/common/workspace.js';
import { IQuantumIDEChatContextOrchestrator } from '../services/quantumide/common/quantumideChatContext.js';
import { IQuantumIDEContextInspectorService } from '../services/quantumide/common/quantumideContextInspector.js';

if (isQuantumIDEBuild(product)) {
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: QuantumIDEAICommandId.ExportContextSnapshot,
				title: localize2('quantumide.chat.exportContext', 'QuantumIDE: Export Agent Context Snapshot'),
				f1: true,
			});
		}
		override async run(accessor: ServicesAccessor): Promise<void> {
			const orchestrator = accessor.get(IQuantumIDEChatContextOrchestrator);
			const inspector = accessor.get(IQuantumIDEContextInspectorService);
			const files = accessor.get(IFileService);
			const workspace = accessor.get(IWorkspaceContextService);
			const notify = accessor.get(INotificationService);
			const folder = workspace.getWorkspace().folders[0];
			if (!folder) {
				notify.warn(localize('quantumide.export.noFolder', 'Open a workspace folder first.'));
				return;
			}
			const body = await orchestrator.buildChatContext({ includeOpenTabs: true, includeTerminal: true, includeBranch: true });
			const sections = inspector.getSections();
			const snapshot = {
				exportedAt: new Date().toISOString(),
				workspaceId: workspace.getWorkspace().id,
				contextBody: body,
				sections,
			};
			const target = joinPath(folder.uri, '.quantumide', 'last-context-export.json');
			try {
				await files.createFolder(joinPath(folder.uri, '.quantumide'));
			} catch {
				// ignore
			}
			await files.writeFile(target, VSBuffer.fromString(JSON.stringify(snapshot, undefined, 2)));
			notify.info(localize('quantumide.export.done', 'Context snapshot written to {0}', target.fsPath));
		}
	});
}
