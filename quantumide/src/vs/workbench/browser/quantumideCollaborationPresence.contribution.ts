/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../base/common/lifecycle.js';
import { isQuantumIDEProduct } from '../../platform/quantumide/common/quantumideChatPlatform.js';
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from '../common/contributions.js';
import product from '../../platform/product/common/product.js';
import { IConfigurationService } from '../../platform/configuration/common/configuration.js';
import { QuantumIDEAISettingId } from '../../platform/quantumide/common/quantumideAISettings.js';
import { IQuantumIDECollaborationService } from '../services/quantumide/common/quantumideCollaboration.js';
import { IEditorService } from '../services/editor/common/editorService.js';
import { EditorResourceAccessor, SideBySideEditor } from '../common/editor.js';
import { ICodeEditorService } from '../../editor/browser/services/codeEditorService.js';
import { isCodeEditor } from '../../editor/browser/editorBrowser.js';

function isQuantumIDE(): boolean {
	return isQuantumIDEProduct(product.applicationName)
		|| [product.nameShort, product.nameLong].some(n => typeof n === 'string' && n.toLowerCase().includes('quantumide'));
}

class QuantumIDECollaborationPresenceContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.quantumideCollaborationPresence';

	constructor(
		@IQuantumIDECollaborationService private readonly _collab: IQuantumIDECollaborationService,
		@IConfigurationService private readonly _config: IConfigurationService,
		@IEditorService private readonly _editorService: IEditorService,
		@ICodeEditorService private readonly _codeEditorService: ICodeEditorService,
	) {
		super();
		if (!isQuantumIDE() || this._config.getValue<boolean>(QuantumIDEAISettingId.ChatCollabEnabled) !== true) {
			return;
		}
		const pulse = () => {
			if (!this._collab.getActiveSession()) {
				return;
			}
			const resource = this._editorService.activeEditor?.resource
				?? EditorResourceAccessor.getCanonicalUri(this._editorService.activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY });
			const control = this._codeEditorService.getActiveCodeEditor();
			if (resource && isCodeEditor(control)) {
				const pos = control.getPosition();
				void this._collab.pulsePresence({
					resource: resource.toString(),
					line: pos?.lineNumber,
					column: pos?.column,
				});
			} else {
				void this._collab.pulsePresence();
			}
		};
		this._register(this._editorService.onDidActiveEditorChange(pulse));
		this._register(this._codeEditorService.onCodeEditorAdd(ed => {
			this._register(ed.onDidChangeCursorPosition(pulse));
		}));
		const intervalMs = this._config.getValue<boolean>(QuantumIDEAISettingId.ChatSyncRealtime) !== false ? 3000 : 20_000;
		const interval = setInterval(pulse, intervalMs);
		this._register({ dispose: () => clearInterval(interval) });
		pulse();
	}
}

if (isQuantumIDE()) {
	registerWorkbenchContribution2(QuantumIDECollaborationPresenceContribution.ID, QuantumIDECollaborationPresenceContribution, WorkbenchPhase.AfterRestored);
}
