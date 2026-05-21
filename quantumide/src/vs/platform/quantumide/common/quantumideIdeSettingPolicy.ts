/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

const AGENT_WRITABLE_PREFIXES = ['quantumide.', 'editor.', 'chat.'] as const;

export function isAgentWritableSettingKey(key: string): boolean {
	const k = key.trim();
	if (!k) {
		return false;
	}
	return AGENT_WRITABLE_PREFIXES.some(prefix => k.startsWith(prefix));
}

export function isValidMarketplaceExtensionId(extensionId: string): boolean {
	const id = extensionId.trim();
	if (!id || id.length > 256) {
		return false;
	}
	return !id.includes('..') && !id.includes('/') && !id.includes('\\');
}
