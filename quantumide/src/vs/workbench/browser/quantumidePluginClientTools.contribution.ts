/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../base/common/cancellation.js';
import { Disposable } from '../../base/common/lifecycle.js';
import { ThemeIcon } from '../../base/common/themables.js';
import { Codicon } from '../../base/common/codicons.js';
import { isQuantumIDEProduct } from '../../platform/quantumide/common/quantumideChatPlatform.js';
import {
	executeQuantumIDEPluginClientTool,
	getQuantumIDEPluginClientTools,
	type IQuantumIDEPluginToolDefinition,
} from '../../platform/quantumide/common/quantumidePluginRegistry.js';
import product from '../../platform/product/common/product.js';
import { IWorkbenchContribution } from '../common/contributions.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../common/contributions.js';
import {
	CountTokensCallback,
	ILanguageModelToolsService,
	IToolData,
	IToolImpl,
	IToolInvocation,
	IToolResult,
	ToolDataSource,
	ToolProgress,
} from '../contrib/chat/common/tools/languageModelToolsService.js';
import { createToolSimpleTextResult } from '../contrib/chat/common/tools/builtinTools/toolHelpers.js';

class QuantumIDEPluginClientToolImpl implements IToolImpl {
	constructor(
		private readonly _definition: IQuantumIDEPluginToolDefinition,
	) { }

	getToolData(): IToolData {
		return {
			id: this._definition.id,
			displayName: this._definition.name,
			modelDescription: this._definition.description,
			userDescription: this._definition.description,
			source: ToolDataSource.Internal,
			icon: ThemeIcon.fromId(Codicon.extensions.id),
			inputSchema: (this._definition.parameters ?? { type: 'object', properties: {} }) as IToolData['inputSchema'],
		};
	}

	async invoke(invocation: IToolInvocation, _count: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		const result = await executeQuantumIDEPluginClientTool(
			this._definition.id,
			invocation.parameters as Record<string, unknown>,
		);
		return createToolSimpleTextResult(result ?? 'Plugin client tool returned no result.');
	}
}

export class QuantumIDEPluginClientToolsContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.quantumidePluginClientTools';

	constructor(
		@ILanguageModelToolsService toolsService: ILanguageModelToolsService,
	) {
		super();
		for (const def of getQuantumIDEPluginClientTools()) {
			const tool = new QuantumIDEPluginClientToolImpl(def);
			this._store.add(toolsService.registerTool(tool.getToolData(), tool));
		}
	}
}

if (isQuantumIDEProduct(product.applicationName)) {
	registerWorkbenchContribution2(QuantumIDEPluginClientToolsContribution.ID, QuantumIDEPluginClientToolsContribution, WorkbenchPhase.BlockRestore);
}
