/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import {
	IQuantumIDEContextInspectorSection,
	IQuantumIDEContextInspectorService,
} from '../common/quantumideContextInspector.js';

export class QuantumIDEContextInspectorService extends Disposable implements IQuantumIDEContextInspectorService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private _sections: IQuantumIDEContextInspectorSection[] = [];
	private _lastBuiltAt: number | undefined;
	private _stale = false;

	getSections(): readonly IQuantumIDEContextInspectorSection[] {
		return this._sections;
	}

	getOmittedSectionIds(): readonly string[] {
		return this._sections.filter(s => s.omitted).map(s => s.id);
	}

	getLastBuiltAt(): number | undefined {
		return this._lastBuiltAt;
	}

	isContextStale(): boolean {
		return this._stale;
	}

	markContextStale(): void {
		if (!this._stale) {
			this._stale = true;
			this._sections = this._sections.map(s => ({ ...s, stale: true }));
			this._onDidChange.fire();
		}
	}

	recordBuild(sections: readonly IQuantumIDEContextInspectorSection[]): void {
		this._sections = [...sections];
		this._lastBuiltAt = Date.now();
		this._stale = false;
		this._onDidChange.fire();
	}

	clear(): void {
		this._sections = [];
		this._lastBuiltAt = undefined;
		this._stale = false;
		this._onDidChange.fire();
	}
}

registerSingleton(IQuantumIDEContextInspectorService, QuantumIDEContextInspectorService, InstantiationType.Delayed);
