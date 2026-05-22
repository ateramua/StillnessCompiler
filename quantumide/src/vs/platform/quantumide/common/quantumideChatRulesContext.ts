/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { joinPath } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import type { IFileService } from '../../files/common/files.js';
import {
	formatQuantumIDEChatRulesForContext,
	selectQuantumIDEChatRules,
} from './quantumideChatRules.js';
import { loadQuantumIDEChatRulesFromWorkspace } from './quantumideChatRulesLoader.js';

export interface IQuantumIDEChatRulesContextBundle {
	readonly agentsMdContent?: string;
	readonly rulesPromptText?: string;
}

export async function buildQuantumIDEChatRulesContextBundle(
	fileService: IFileService,
	workspaceFolder: URI | undefined,
	activeRelativePaths: readonly string[] = [],
	maxRulesChars = 12_000,
): Promise<IQuantumIDEChatRulesContextBundle> {
	if (!workspaceFolder) {
		return {};
	}
	let agentsMdContent: string | undefined;
	const agentsMd = joinPath(workspaceFolder, 'AGENTS.md');
	try {
		const content = (await fileService.readFile(agentsMd)).value.toString().trim();
		if (content) {
			agentsMdContent = content.slice(0, maxRulesChars);
		}
	} catch {
		// optional
	}
	const allRules = await loadQuantumIDEChatRulesFromWorkspace(fileService, workspaceFolder);
	const selection = selectQuantumIDEChatRules(allRules, activeRelativePaths);
	const rulesPromptText = formatQuantumIDEChatRulesForContext(selection, maxRulesChars).trim() || undefined;
	return { agentsMdContent, rulesPromptText };
}
