/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { QUANTUMIDE_WORKSPACE_POLICIES_FILE } from './quantumideSemanticIndex.js';
import { joinPath } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import type { IFileService } from '../../files/common/files.js';

export interface IQuantumIDEWorkspacePolicies {
	readonly allowAutoApplyEdits?: boolean;
	readonly allowTerminalExecution?: boolean;
	readonly maxEditScope?: number;
	readonly excludedPaths?: readonly string[];
	readonly customPromptPrefix?: string;
	/** Enterprise policy: restrict agent writes to workspace root (§5.1). */
	readonly restrictFilesystemToWorkspace?: boolean;
	/** Enterprise policy: require approval for all terminal commands. */
	readonly requireTerminalApproval?: boolean;
	/** Optional allowlist of command prefixes (first token) for terminal sandbox (§2.7). */
	readonly allowedTerminalPrefixes?: readonly string[];
}

export async function loadQuantumIDEWorkspacePolicies(
	fileService: IFileService,
	workspaceFolder: URI | undefined,
): Promise<IQuantumIDEWorkspacePolicies | undefined> {
	if (!workspaceFolder) {
		return undefined;
	}
	const policiesFile = joinPath(workspaceFolder, QUANTUMIDE_WORKSPACE_POLICIES_FILE);
	try {
		const raw = (await fileService.readFile(policiesFile)).value.toString();
		const parsed = JSON.parse(raw) as IQuantumIDEWorkspacePolicies;
		return parsed && typeof parsed === 'object' ? parsed : undefined;
	} catch {
		return undefined;
	}
}
