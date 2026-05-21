/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../base/common/async.js';
import { localize } from '../../../../nls.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { QuantumIDEAISettingId } from '../../../../platform/quantumide/common/quantumideAISettings.js';
import { IQuantumIDECollaborationService } from '../common/quantumideCollaboration.js';
import { IChatService } from '../../../contrib/chat/common/chatService/chatService.js';

export interface IQuantumIDECollabChatContextSyncService {
	readonly _serviceBrand: undefined;
}

export const IQuantumIDECollabChatContextSyncService = createDecorator<IQuantumIDECollabChatContextSyncService>('quantumIDECollabChatContextSyncService');

export class QuantumIDECollabChatContextSyncService extends Disposable implements IQuantumIDECollabChatContextSyncService {
	declare readonly _serviceBrand: undefined;

	private _lastSnippet = '';
	private readonly _flush = this._register(new RunOnceScheduler(() => void this._publish(), 800));

	constructor(
		@IQuantumIDECollaborationService private readonly _collab: IQuantumIDECollaborationService,
		@IChatService private readonly _chatService: IChatService,
		@IConfigurationService private readonly _config: IConfigurationService,
	) {
		super();
		if (this._config.getValue<boolean>(QuantumIDEAISettingId.ChatCollabEnabled) !== true) {
			return;
		}
		this._register(this._chatService.onDidSubmitRequest(() => this._flush.schedule()));
	}

	private async _publish(): Promise<void> {
		if (!this._collab.getActiveSession()) {
			return;
		}
		const text = localize('quantumide.collab.chatSync', 'Chat activity at {0}', new Date().toISOString());
		if (text === this._lastSnippet) {
			return;
		}
		this._lastSnippet = text;
		await this._collab.appendChatMessage(JSON.stringify({ type: 'chat_context', text, at: Date.now() }), 'chat-sync');
	}
}

registerSingleton(IQuantumIDECollabChatContextSyncService, QuantumIDECollabChatContextSyncService, InstantiationType.Delayed);
