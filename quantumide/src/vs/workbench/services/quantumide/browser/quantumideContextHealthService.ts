/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IQuantumIDEChatContextOrchestrator } from '../common/quantumideChatContext.js';
import {
	IQuantumIDEContextHealthService,
	IQuantumIDEContextHealthSnapshot,
} from '../common/quantumideContextHealth.js';
import { IQuantumIDEErrorRecoveryService } from '../common/quantumideErrorRecovery.js';

export class QuantumIDEContextHealthService extends Disposable implements IQuantumIDEContextHealthService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private _snapshot: IQuantumIDEContextHealthSnapshot = {
		state: 'healthy',
		lastBuiltAt: undefined,
		lastError: undefined,
		sectionCount: 0,
		omittedSectionCount: 0,
		includesUnsavedBuffers: false,
	};

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IQuantumIDEErrorRecoveryService private readonly _errors: IQuantumIDEErrorRecoveryService,
	) {
		super();
	}

	private _getOrchestrator(): IQuantumIDEChatContextOrchestrator {
		return this._instantiationService.invokeFunction(accessor => accessor.get(IQuantumIDEChatContextOrchestrator));
	}

	getSnapshot(): IQuantumIDEContextHealthSnapshot {
		return this._snapshot;
	}

	recordSuccess(sectionCount: number, omittedCount: number, includesUnsaved: boolean): void {
		this._snapshot = {
			state: omittedCount > 0 ? 'degraded' : 'healthy',
			lastBuiltAt: Date.now(),
			lastError: undefined,
			sectionCount,
			omittedSectionCount: omittedCount,
			includesUnsavedBuffers: includesUnsaved,
		};
		this._onDidChange.fire();
	}

	recordFailure(error: string): void {
		this._snapshot = {
			...this._snapshot,
			state: 'unavailable',
			lastError: error,
		};
		this._onDidChange.fire();
		this._errors.report({
			id: 'context-build',
			message: error,
			recoverable: true,
			retryCommand: 'quantumide.chat.reloadContext',
		});
	}

	async reloadContext(options?: { userQuery?: string }): Promise<string> {
		try {
			const body = await this._getOrchestrator().buildChatContext({ userQuery: options?.userQuery });
			const omittedMatch = body.match(/Omitted sections \((\d+)\)/);
			const omitted = omittedMatch ? parseInt(omittedMatch[1], 10) : 0;
			const sections = (body.match(/^## /gm) ?? []).length;
			this.recordSuccess(sections, omitted, body.includes('unsaved'));
			return body;
		} catch (err) {
			const msg = String(err);
			this.recordFailure(msg);
			throw err;
		}
	}
}

registerSingleton(IQuantumIDEContextHealthService, QuantumIDEContextHealthService, InstantiationType.Delayed);
