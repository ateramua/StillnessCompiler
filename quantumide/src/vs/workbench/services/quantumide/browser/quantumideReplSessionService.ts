/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import {
	appendReplHistory,
	buildReplCommand,
	createReplSession,
	formatReplOutput,
	type IQuantumIDEReplSessionState,
} from '../../../../platform/quantumide/common/quantumideReplSession.js';
import { IQuantumIDELivePreviewService } from './quantumideLivePreviewService.js';

export interface IQuantumIDEReplSessionService {
	readonly _serviceBrand: undefined;
	readonly onDidRun: import('../../../../base/common/event.js').Event<{ sessionId: string; output: string }>;
	runInSession(language: string | undefined, code: string, sessionId?: string): Promise<{ sessionId: string; formatted: string }>;
	getSession(sessionId: string): IQuantumIDEReplSessionState | undefined;
	clearSession(sessionId: string): void;
}

export const IQuantumIDEReplSessionService = createDecorator<IQuantumIDEReplSessionService>('quantumIDEReplSessionService');

export class QuantumIDEReplSessionService extends Disposable implements IQuantumIDEReplSessionService {
	declare readonly _serviceBrand: undefined;

	private readonly _sessions = new Map<string, IQuantumIDEReplSessionState>();
	private readonly _onDidRun = this._register(new Emitter<{ sessionId: string; output: string }>());
	readonly onDidRun = this._onDidRun.event;

	constructor(
		@IQuantumIDELivePreviewService private readonly _livePreview: IQuantumIDELivePreviewService,
	) { super(); }

	getSession(sessionId: string): IQuantumIDEReplSessionState | undefined {
		return this._sessions.get(sessionId);
	}

	clearSession(sessionId: string): void {
		this._sessions.delete(sessionId);
	}

	async runInSession(language: string | undefined, code: string, sessionId?: string): Promise<{ sessionId: string; formatted: string }> {
		let session = sessionId ? this._sessions.get(sessionId) : undefined;
		if (!session) {
			session = createReplSession(language ?? 'javascript', sessionId);
			this._sessions.set(session.sessionId, session);
		}
		const command = buildReplCommand(session, code);
		const result = await this._livePreview.runSnippetPreview(session.language, code);
		const updated = appendReplHistory(session, code, result.output);
		this._sessions.set(updated.sessionId, updated);
		this._onDidRun.fire({ sessionId: updated.sessionId, output: result.output });
		const formatted = formatReplOutput({
			output: result.output,
			stderr: /error|exception|fail/i.test(result.output) ? result.output : '',
			success: result.success && !/error|exception/i.test(result.output),
			command,
		}, updated);
		return { sessionId: updated.sessionId, formatted };
	}
}

registerSingleton(IQuantumIDEReplSessionService, QuantumIDEReplSessionService, InstantiationType.Delayed);
