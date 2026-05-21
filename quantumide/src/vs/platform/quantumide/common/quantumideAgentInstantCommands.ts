/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/** Safe palette commands the agent may run without per-invocation user approval when instant mode is on. */
export const QUANTUMIDE_AGENT_INSTANT_SAFE_COMMANDS: readonly string[] = [
	'editor.action.formatDocument',
	'editor.action.formatSelection',
	'editor.action.organizeImports',
	'editor.action.quickFix',
	'editor.action.refactor',
	'editor.action.rename',
	'editor.action.revealDefinition',
	'editor.action.goToReferences',
	'editor.action.marker.next',
	'editor.action.marker.prev',
	'workbench.action.gotoSymbol',
	'workbench.files.action.showActiveFileInExplorer',
	'workbench.action.splitEditor',
	'workbench.action.splitEditorOrthogonal',
	'workbench.action.toggleMultiDiffEditor',
	'workbench.action.files.save',
	'workbench.action.files.saveAll',
	'merge.goToNextUnhandledConflict',
	'merge.acceptAllInput1',
	'merge.acceptAllInput2',
	'merge.compare',
	'testing.runAll',
	'testing.runCurrentFile',
	'testing.refreshTests',
];

export function isQuantumIDEInstantSafeCommand(commandId: string, instantPaletteEnabled: boolean): boolean {
	if (!instantPaletteEnabled) {
		return false;
	}
	const id = commandId.trim();
	return QUANTUMIDE_AGENT_INSTANT_SAFE_COMMANDS.includes(id)
		|| id.startsWith('editor.action.format')
		|| id.startsWith('testing.run')
		|| id === 'merge.goToNextUnhandledConflict';
}
