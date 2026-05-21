/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../base/common/buffer.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { joinPath } from '../../../../base/common/resources.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import {
	IQuantumIDEExecutionGraphNode,
	IQuantumIDEExecutionGraphService,
	QUANTUMIDE_EXECUTION_GRAPH_FILE,
} from '../common/quantumideExecutionGraph.js';

export class QuantumIDEExecutionGraphService extends Disposable implements IQuantumIDEExecutionGraphService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private _nodes: IQuantumIDEExecutionGraphNode[] = [];

	constructor(
		@IFileService private readonly _files: IFileService,
		@IWorkspaceContextService private readonly _workspace: IWorkspaceContextService,
	) {
		super();
		void this.loadFromDisk();
	}

	getNodes(): readonly IQuantumIDEExecutionGraphNode[] {
		return [...this._nodes];
	}

	async upsertNode(node: IQuantumIDEExecutionGraphNode): Promise<void> {
		const idx = this._nodes.findIndex(n => n.id === node.id);
		if (idx >= 0) {
			this._nodes[idx] = node;
		} else {
			this._nodes.push(node);
		}
		await this._persist();
		this._onDidChange.fire();
	}

	async loadFromDisk(): Promise<void> {
		const folder = this._workspace.getWorkspace().folders[0];
		if (!folder) {
			return;
		}
		try {
			const raw = (await this._files.readFile(joinPath(folder.uri, QUANTUMIDE_EXECUTION_GRAPH_FILE))).value.toString();
			const parsed = JSON.parse(raw) as { nodes?: IQuantumIDEExecutionGraphNode[] };
			this._nodes = parsed.nodes ?? [];
			this._onDidChange.fire();
		} catch {
			this._nodes = [];
		}
	}

	formatChecklist(): string {
		const icon = (s: IQuantumIDEExecutionGraphNode['status']) => {
			switch (s) {
				case 'completed': return '✓';
				case 'running': return '…';
				case 'failed': return '✗';
				default: return '○';
			}
		};
		return this._nodes.map(n => `${icon(n.status)} [${n.phase}] ${n.label}${n.error ? ` — ${n.error}` : ''}`).join('\n');
	}

	private async _persist(): Promise<void> {
		const folder = this._workspace.getWorkspace().folders[0];
		if (!folder) {
			return;
		}
		const uri = joinPath(folder.uri, QUANTUMIDE_EXECUTION_GRAPH_FILE);
		await this._files.createFolder(joinPath(folder.uri, '.quantumide'));
		await this._files.writeFile(uri, VSBuffer.fromString(JSON.stringify({ nodes: this._nodes }, null, 2)));
	}
}

registerSingleton(IQuantumIDEExecutionGraphService, QuantumIDEExecutionGraphService, InstantiationType.Delayed);
