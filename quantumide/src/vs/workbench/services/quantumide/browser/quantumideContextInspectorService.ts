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

	getSections(): readonly IQuantumIDEContextInspectorSection[] {
		return this._sections;
	}

	getLastBuiltAt(): number | undefined {
		return this._lastBuiltAt;
	}

	recordBuild(sections: readonly IQuantumIDEContextInspectorSection[]): void {
		this._sections = [...sections];
		this._lastBuiltAt = Date.now();
		this._onDidChange.fire();
	}

	clear(): void {
		this._sections = [];
		this._lastBuiltAt = undefined;
		this._onDidChange.fire();
	}
}

registerSingleton(IQuantumIDEContextInspectorService, QuantumIDEContextInspectorService, InstantiationType.Delayed);
