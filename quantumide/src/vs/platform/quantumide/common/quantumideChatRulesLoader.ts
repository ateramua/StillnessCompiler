/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { joinPath } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import type { IFileService } from '../../files/common/files.js';
import {
	type IQuantumIDEChatRule,
	parseQuantumIDERuleFrontmatter,
	QUANTUMIDE_RULES_SEARCH_DIRS,
} from './quantumideChatRules.js';

export async function loadQuantumIDEChatRulesFromWorkspace(
	fileService: IFileService,
	workspaceFolder: URI,
): Promise<IQuantumIDEChatRule[]> {
	const rules: IQuantumIDEChatRule[] = [];
	for (const dirName of QUANTUMIDE_RULES_SEARCH_DIRS) {
		const dir = joinPath(workspaceFolder, dirName);
		try {
			const resolved = await fileService.resolve(dir);
			for (const child of resolved.children ?? []) {
				if (child.isDirectory || !(child.name.endsWith('.md') || child.name.endsWith('.mdc'))) {
					continue;
				}
				try {
					const raw = (await fileService.readFile(child.resource)).value.toString();
					const { activation, globs, body } = parseQuantumIDERuleFrontmatter(raw);
					const rel = `${dirName}/${child.name}`;
					rules.push({ path: rel, activation, globs, content: body.trim() });
				} catch {
					// skip
				}
			}
		} catch {
			// no rules directory
		}
	}
	return rules;
}
