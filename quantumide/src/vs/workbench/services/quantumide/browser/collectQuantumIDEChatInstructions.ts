/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken } from '../../../../base/common/cancellation.js';
import { relativePath } from '../../../../base/common/resources.js';
import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import type { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import type { IFileService } from '../../../../platform/files/common/files.js';
import type { ILogService } from '../../../../platform/log/common/log.js';
import { isQuantumIDEBuild } from '../../../../platform/quantumide/common/quantumideChatPlatform.js';
import { buildQuantumIDEChatRulesContextBundle } from '../../../../platform/quantumide/common/quantumideChatRulesContext.js';
import { formatQuantumIDEWorkspaceDiscoveryLog } from '../../../../platform/quantumide/common/quantumideWorkspaceDiscoveryLog.js';
import type { IProductService } from '../../../../platform/product/common/productService.js';
import type { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import {
	ChatRequestVariableSet,
	IChatRequestVariableEntry,
	isPromptFileVariableEntry,
	isWorkspaceVariableEntry,
	PromptFileVariableKind,
	toPromptFileVariableEntry,
	toQuantumIDEChatRulesPromptTextEntry,
} from '../../../contrib/chat/common/attachments/chatVariableEntries.js';

export interface ICollectQuantumIDEChatInstructionsDeps {
	readonly productService: IProductService;
	readonly fileService: IFileService;
	readonly workspaceService: IWorkspaceContextService;
	readonly codeEditorService: ICodeEditorService;
	readonly logService: ILogService;
}

function gatherActiveRelativePaths(
	workspaceFolder: URI,
	workspaceService: IWorkspaceContextService,
	codeEditorService: ICodeEditorService,
	variables: ChatRequestVariableSet,
): string[] {
	const paths = new Set<string>();
	const activeUri = codeEditorService.getActiveCodeEditor()?.getModel()?.uri;
	if (activeUri) {
		const rel = relativePath(workspaceFolder, activeUri);
		if (rel) {
			paths.add(rel.replace(/\\/g, '/'));
		}
	}
	for (const variable of variables.asArray()) {
		const uri = IChatRequestVariableEntry.toUri(variable);
		if (uri) {
			const rel = relativePath(workspaceFolder, uri);
			if (rel) {
				paths.add(rel.replace(/\\/g, '/'));
			}
			continue;
		}
		if (isPromptFileVariableEntry(variable)) {
			const rel = relativePath(workspaceFolder, variable.value);
			if (rel) {
				paths.add(rel.replace(/\\/g, '/'));
			}
			continue;
		}
		if (isWorkspaceVariableEntry(variable) && variable.value?.trim()) {
			paths.add(variable.value.trim().replace(/\\/g, '/'));
		}
	}
	return [...paths];
}

/**
 * M-11: append QuantumIDE Always/Auto/Manual rules and AGENTS.md to the chat
 * `collectInstructions` variable set (via {@link ComputeAutomaticInstructions}).
 */
export async function collectQuantumIDEChatInstructions(
	deps: ICollectQuantumIDEChatInstructionsDeps,
	variables: ChatRequestVariableSet,
	token: CancellationToken,
): Promise<IChatRequestVariableEntry[]> {
	if (token.isCancellationRequested || !isQuantumIDEBuild(deps.productService)) {
		return [];
	}
	const workspaceFolder = deps.workspaceService.getWorkspace().folders[0]?.uri;
	if (!workspaceFolder) {
		return [];
	}
	const added: IChatRequestVariableEntry[] = [];
	const existingIds = new Set(variables.asArray().map(v => v.id));
	const activeRelativePaths = gatherActiveRelativePaths(
		workspaceFolder,
		deps.workspaceService,
		deps.codeEditorService,
		variables,
	);
	try {
		const bundle = await buildQuantumIDEChatRulesContextBundle(
			deps.fileService,
			workspaceFolder,
			activeRelativePaths,
		);
		if (bundle.agentsMdContent) {
			const agentsUri = joinPath(workspaceFolder, 'AGENTS.md');
			const entry = toPromptFileVariableEntry(
				agentsUri,
				PromptFileVariableKind.Instruction,
				'QuantumIDE AGENTS.md (automatic)',
				true,
			);
			if (!existingIds.has(entry.id)) {
				variables.add(entry);
				added.push(entry);
				existingIds.add(entry.id);
			}
		}
		if (bundle.rulesPromptText) {
			const entry = toQuantumIDEChatRulesPromptTextEntry(bundle.rulesPromptText);
			if (!existingIds.has(entry.id)) {
				variables.add(entry);
				added.push(entry);
			}
		}
		if (added.length > 0) {
			deps.logService.trace(formatQuantumIDEWorkspaceDiscoveryLog({
				component: 'chat-context',
				operation: 'collect-instructions',
				matchCount: added.length,
			}));
		}
	} catch (err) {
		deps.logService.warn(formatQuantumIDEWorkspaceDiscoveryLog({
			component: 'chat-context',
			operation: 'collect-instructions',
			error: String(err),
		}));
	}
	return added;
}
