/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../base/common/buffer.js';
import { joinPath } from '../../base/common/resources.js';
import { Disposable } from '../../base/common/lifecycle.js';
import { autorun } from '../../base/common/observable.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../common/contributions.js';
import { IFileService } from '../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../platform/workspace/common/workspace.js';
import { ILanguageModelToolsService } from '../contrib/chat/common/tools/languageModelToolsService.js';
import { isQuantumIDEProduct } from '../../platform/quantumide/common/quantumideChatPlatform.js';
import {
	QUANTUMIDE_MCP_TOOLS_MANIFEST_FILE,
	buildMcpToolsManifest,
	type IQuantumIDEMcpToolManifestEntry,
} from '../../platform/quantumide/common/quantumideMcpToolsManifest.js';
import product from '../../platform/product/common/product.js';

class QuantumIDEMcpToolBridgeContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.quantumideMcpToolBridge';

	constructor(
		@ILanguageModelToolsService private readonly _toolsService: ILanguageModelToolsService,
		@IFileService private readonly _fileService: IFileService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
	) {
		super();
		if (!isQuantumIDEProduct(product.applicationName)) {
			return;
		}
		const toolsObs = this._toolsService.observeTools(undefined);
		this._register(autorun(reader => {
			const tools = toolsObs.read(reader);
			const mcpTools: IQuantumIDEMcpToolManifestEntry[] = [];
			for (const tool of tools) {
				if (tool.source.type !== 'mcp' || !tool.toolReferenceName) {
					continue;
				}
				mcpTools.push({
					referenceName: tool.toolReferenceName,
					displayName: tool.displayName,
					description: tool.modelDescription,
					inputSchema: tool.inputSchema as Record<string, unknown> | undefined,
					serverLabel: tool.source.serverLabel,
				});
			}
			void this._persistManifest(mcpTools);
		}));
	}

	private async _persistManifest(tools: IQuantumIDEMcpToolManifestEntry[]): Promise<void> {
		const folder = this._workspaceContextService.getWorkspace().folders[0];
		if (!folder) {
			return;
		}
		const manifest = buildMcpToolsManifest(tools);
		const target = joinPath(folder.uri, QUANTUMIDE_MCP_TOOLS_MANIFEST_FILE);
		await this._fileService.createFolder(joinPath(folder.uri, '.quantumide'));
		await this._fileService.writeFile(target, VSBuffer.fromString(JSON.stringify(manifest, undefined, 2)));
	}
}

registerWorkbenchContribution2(QuantumIDEMcpToolBridgeContribution.ID, QuantumIDEMcpToolBridgeContribution, WorkbenchPhase.AfterRestored);
