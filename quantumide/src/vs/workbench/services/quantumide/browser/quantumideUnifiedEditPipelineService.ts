/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import {
	IQuantumIDEEditProposal,
	IQuantumIDEUnifiedEditPipelineService,
} from '../common/quantumideUnifiedEditPipeline.js';
import { IQuantumIDEChatEditSessionService } from './quantumideChatEditSessionService.js';
import { IQuantumIDEChatInlineEditService } from './quantumideChatInlineEditService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { QuantumIDEAISettingId } from '../../../../platform/quantumide/common/quantumideAISettings.js';
import { IQuantumIDEChatInThreadInjectService } from '../common/quantumideChatInThreadInject.js';

export class QuantumIDEUnifiedEditPipelineService extends Disposable implements IQuantumIDEUnifiedEditPipelineService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	constructor(
		@IQuantumIDEChatEditSessionService private readonly _session: IQuantumIDEChatEditSessionService,
		@IQuantumIDEChatInlineEditService private readonly _inline: IQuantumIDEChatInlineEditService,
		@IQuantumIDEChatInThreadInjectService private readonly _inThread: IQuantumIDEChatInThreadInjectService,
		@IConfigurationService private readonly _configuration: IConfigurationService,
		@ICommandService private readonly _commands: ICommandService,
	) {
		super();
		this._register(this._inline.onDidChangePending(() => this._onDidChange.fire()));
	}

	getPendingCount(): number {
		return this._session.getPendingCount();
	}

	async proposeEdits(
		edits: readonly IQuantumIDEEditProposal[],
		label = 'Agent proposed edits',
		options?: { openMultiDiff?: boolean },
	): Promise<void> {
		const autoApply = this._configuration.getValue<boolean>(QuantumIDEAISettingId.AgentAutoApplyEdits) === true;
		await this._session.stageFromProposedEdits(edits, label);
		if (autoApply) {
			const result = await this._session.acceptAll();
			this._inThread.injectEditReviewIntoActiveChat(
				localize('quantumide.pipeline.autoApplied', '{0} (auto-applied {1} file(s))', label, result.applied),
			);
			if (result.applied > 0 && this._configuration.getValue<boolean>(QuantumIDEAISettingId.AgentRefactorAutoVerify) !== false) {
				await this._runPostApplyVerify();
			}
		} else {
			this._inThread.injectEditReviewIntoActiveChat(label);
			const paths = edits.map(e => e.path);
			this._inThread.injectBatchReviewSummary(this._session.getBatchIds().length, edits.length, paths);
		}
		if (options?.openMultiDiff === false) {
			return;
		}
		this._onDidChange.fire();
	}

	async acceptAll(): Promise<{ applied: number; errors: string[] }> {
		const result = await this._session.acceptAll();
		if (result.applied > 0 && this._configuration.getValue<boolean>(QuantumIDEAISettingId.AgentRefactorAutoVerify) !== false) {
			await this._runPostApplyVerify();
		}
		return result;
	}

	private async _runPostApplyVerify(): Promise<void> {
		try {
			await this._commands.executeCommand('quantumide.chat.runWorkspaceTests');
		} catch {
			// command registered in next-batch contribution
		}
	}

	rejectAll(): void {
		this._session.rejectAll();
	}

	acceptById(id: string): Promise<boolean> {
		return this._session.acceptEditById(id);
	}

	rejectById(id: string): void {
		this._session.rejectEditById(id);
	}
}

registerSingleton(IQuantumIDEUnifiedEditPipelineService, QuantumIDEUnifiedEditPipelineService, InstantiationType.Delayed);
