/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export interface IQuantumIDECommandAuditEntry {
	readonly commandId: string;
	readonly timestamp: number;
	readonly source: string;
	readonly success: boolean;
	readonly detail?: string;
}

export interface IQuantumIDECommandAuditService {
	readonly _serviceBrand: undefined;
	readonly onDidAppend: import('../../../../base/common/event.js').Event<IQuantumIDECommandAuditEntry>;
	getSessionLog(limit?: number): readonly IQuantumIDECommandAuditEntry[];
	append(entry: Omit<IQuantumIDECommandAuditEntry, 'timestamp'> & { timestamp?: number }): void;
	clear(): void;
}

export const IQuantumIDECommandAuditService = createDecorator<IQuantumIDECommandAuditService>('quantumIDECommandAuditService');

export class QuantumIDECommandAuditService extends Disposable implements IQuantumIDECommandAuditService {
	declare readonly _serviceBrand: undefined;

	private readonly _entries: IQuantumIDECommandAuditEntry[] = [];
	private readonly _onDidAppend = this._register(new Emitter<IQuantumIDECommandAuditEntry>());
	readonly onDidAppend = this._onDidAppend.event;

	getSessionLog(limit = 100): readonly IQuantumIDECommandAuditEntry[] {
		return this._entries.slice(-limit);
	}

	append(entry: Omit<IQuantumIDECommandAuditEntry, 'timestamp'> & { timestamp?: number }): void {
		const full: IQuantumIDECommandAuditEntry = {
			...entry,
			timestamp: entry.timestamp ?? Date.now(),
		};
		this._entries.push(full);
		if (this._entries.length > 500) {
			this._entries.splice(0, this._entries.length - 400);
		}
		this._onDidAppend.fire(full);
	}

	clear(): void {
		this._entries.length = 0;
	}
}

registerSingleton(IQuantumIDECommandAuditService, QuantumIDECommandAuditService, InstantiationType.Delayed);
