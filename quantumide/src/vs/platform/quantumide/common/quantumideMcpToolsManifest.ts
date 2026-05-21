/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

export const QUANTUMIDE_MCP_TOOLS_MANIFEST_FILE = '.quantumide/mcp-tools.json';

export interface IQuantumIDEMcpToolManifestEntry {
	readonly referenceName: string;
	readonly displayName: string;
	readonly description?: string;
	readonly inputSchema?: Record<string, unknown>;
	readonly serverLabel?: string;
}

export interface IQuantumIDEMcpToolsManifest {
	readonly version: 1;
	readonly generatedAt: string;
	readonly tools: readonly IQuantumIDEMcpToolManifestEntry[];
}

export function buildMcpToolsManifest(tools: readonly IQuantumIDEMcpToolManifestEntry[]): IQuantumIDEMcpToolsManifest {
	return {
		version: 1,
		generatedAt: new Date().toISOString(),
		tools,
	};
}

export function parseMcpToolsManifestJson(raw: string): IQuantumIDEMcpToolsManifest | undefined {
	try {
		const parsed = JSON.parse(raw) as IQuantumIDEMcpToolsManifest;
		return parsed?.version === 1 && Array.isArray(parsed.tools) ? parsed : undefined;
	} catch {
		return undefined;
	}
}

export function mcpManifestToOpenAIToolDefinitions(manifest: IQuantumIDEMcpToolsManifest): {
	readonly name: string;
	readonly description: string;
	readonly parameters: Record<string, unknown>;
}[] {
	return manifest.tools.map(tool => ({
		name: `mcp_${tool.referenceName.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 48)}`,
		description: tool.description ?? `${tool.displayName}${tool.serverLabel ? ` (MCP: ${tool.serverLabel})` : ''}`,
		parameters: tool.inputSchema ?? { type: 'object', properties: {} },
	}));
}
