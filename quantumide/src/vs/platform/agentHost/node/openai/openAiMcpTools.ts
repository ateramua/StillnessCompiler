/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import type { IFileService } from '../../../files/common/files.js';
import {
	mcpManifestToOpenAIToolDefinitions,
	parseMcpToolsManifestJson,
	QUANTUMIDE_MCP_TOOLS_MANIFEST_FILE,
} from '../../../quantumide/common/quantumideMcpToolsManifest.js';
import type { IOpenAIToolDefinition } from './openAiClient.js';

export async function loadQuantumIDEMcpOpenAITools(
	fileService: IFileService,
	workingDirectory: URI | undefined,
	openAiNameToReference: Map<string, string>,
): Promise<IOpenAIToolDefinition[]> {
	if (!workingDirectory) {
		return [];
	}
	try {
		const raw = (await fileService.readFile(joinPath(workingDirectory, QUANTUMIDE_MCP_TOOLS_MANIFEST_FILE))).value.toString();
		const manifest = parseMcpToolsManifestJson(raw);
		if (!manifest?.tools.length) {
			return [];
		}
		const defs = mcpManifestToOpenAIToolDefinitions(manifest);
		const tools: IOpenAIToolDefinition[] = [];
		for (let i = 0; i < defs.length; i++) {
			const def = defs[i];
			const entry = manifest.tools[i];
			openAiNameToReference.set(def.name, entry.referenceName);
			tools.push({
				type: 'function',
				function: {
					name: def.name,
					description: def.description,
					parameters: def.parameters,
				},
			});
		}
		return tools;
	} catch {
		return [];
	}
}
