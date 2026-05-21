/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../base/common/lifecycle.js';
import { URI } from '../../base/common/uri.js';
import { isQuantumIDEProduct } from '../../platform/quantumide/common/quantumideChatPlatform.js';
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from '../common/contributions.js';
import product from '../../platform/product/common/product.js';
import { IChatService } from '../contrib/chat/common/chatService/chatService.js';
import { IQuantumIDEChatThreadStoreService } from '../services/quantumide/common/quantumideChatThreadStore.js';

function isQuantumIDE(): boolean {
	return isQuantumIDEProduct(product.applicationName)
		|| [product.nameShort, product.nameLong].some(n => typeof n === 'string' && n.toLowerCase().includes('quantumide'));
}

class QuantumIDEChatThreadTrackerContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.quantumideChatThreadTracker';

	constructor(
		@IChatService private readonly _chatService: IChatService,
		@IQuantumIDEChatThreadStoreService private readonly _threads: IQuantumIDEChatThreadStoreService,
	) {
		super();
		if (!isQuantumIDE()) {
			return;
		}
		this._register(this._chatService.onDidSubmitRequest(({ chatSessionResource }) => {
			this._syncThread(chatSessionResource);
		}));
	}

	private _syncThread(sessionResource: URI): void {
		const model = this._chatService.getSession(sessionResource);
		const title = this._chatService.getSessionTitle(sessionResource)
			?? model?.title
			?? sessionResource.path.split('/').pop()
			?? 'Chat';
		const messageCount = model?.getRequests().length ?? 0;
		this._threads.registerSession(sessionResource, title);
		this._threads.updateSession(sessionResource, { title, messageCount });
	}
}

if (isQuantumIDE()) {
	registerWorkbenchContribution2(QuantumIDEChatThreadTrackerContribution.ID, QuantumIDEChatThreadTrackerContribution, WorkbenchPhase.AfterRestored);
}
