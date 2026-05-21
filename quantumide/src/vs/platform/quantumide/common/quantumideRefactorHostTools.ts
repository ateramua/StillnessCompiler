/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/** Host refactor tools that should trigger post-change verification when enabled (§2.9). */
export const QUANTUMIDE_REFACTOR_HOST_TOOLS = new Set([
	'normalize_imports',
	'rewrite_imports',
	'rename_symbol',
	'extract_method',
	'extract_component',
	'move_module',
	'migrate_api',
	'migrate_framework',
]);

export function isQuantumIDERefactorHostTool(toolName: string): boolean {
	return QUANTUMIDE_REFACTOR_HOST_TOOLS.has(toolName);
}
