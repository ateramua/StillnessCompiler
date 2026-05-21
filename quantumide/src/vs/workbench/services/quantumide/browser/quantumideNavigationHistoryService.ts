/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { basename } from '../../../../base/common/path.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IEditorService } from '../../editor/common/editorService.js';
import {
	IQuantumIDENavigationHistoryEntry,
	IQuantumIDENavigationHistoryService,
} from '../common/quantumideNavigationHistory.js';

const MAX_ENTRIES = 24;

export class QuantumIDENavigationHistoryService extends Disposable implements IQuantumIDENavigationHistoryService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private _entries: IQuantumIDENavigationHistoryEntry[] = [];

	constructor(
		@IEditorService private readonly _editorService: IEditorService,
	) {
		super();
		this._register(this._editorService.onDidActiveEditorChange(() => {
			const resource = this._editorService.activeEditor?.resource;
			if (resource) {
				this.record({ resource: resource.toString(), kind: 'tab' });
			}
		}));
	}

	getRecent(limit = MAX_ENTRIES): readonly IQuantumIDENavigationHistoryEntry[] {
		return this._entries.slice(0, limit);
	}

	record(entry: Omit<IQuantumIDENavigationHistoryEntry, 'at'>): void {
		const next: IQuantumIDENavigationHistoryEntry = { ...entry, at: Date.now() };
		this._entries = [next, ...this._entries.filter(e => e.resource !== entry.resource || e.kind !== entry.kind)].slice(0, MAX_ENTRIES);
		this._onDidChange.fire();
	}

	formatForContext(maxEntries = 8): string {
		if (!this._entries.length) {
			return '';
		}
		return this._entries.slice(0, maxEntries).map(e => {
			const name = basename(e.resource);
			const line = e.line ? `:${e.line}` : '';
			return `- [${e.kind}] ${name}${line}`;
		}).join('\n');
	}
}

registerSingleton(IQuantumIDENavigationHistoryService, QuantumIDENavigationHistoryService, InstantiationType.Delayed);
