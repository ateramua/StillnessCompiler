/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { $, append, clearNode } from '../../../../../../base/browser/dom.js';
import { Disposable, IDisposable } from '../../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../../nls.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { URI } from '../../../../../../base/common/uri.js';

export interface IParityUiAction {
	readonly label: string;
	readonly command: string;
	readonly args?: unknown[];
	readonly disabled?: boolean;
}

export interface IParityTreeNode {
	readonly id: string;
	readonly label: string;
	readonly path: string;
	readonly isDirectory: boolean;
	readonly children?: readonly IParityTreeNode[];
	readonly resourceUri?: URI;
	readonly badge?: string;
	readonly status?: 'modified' | 'staged' | 'conflict' | 'error' | 'passed' | 'failed' | 'skipped';
}

export function renderParityEmptyState(container: HTMLElement, message: string, actions: readonly IParityUiAction[], commandService: ICommandService, register: (d: IDisposable) => void): void {
	append(container, $('p.quantumide-parity-empty', {}, message));
	renderParityActions(container, actions, commandService, register);
}

export function renderParityErrorBanner(container: HTMLElement, message: string, retryAction?: IParityUiAction, commandService?: ICommandService, register?: (d: IDisposable) => void): void {
	const banner = append(container, $('.quantumide-parity-error', { role: 'alert' }));
	append(banner, $('span', {}, message));
	if (retryAction && commandService && register) {
		const btn = append(banner, $('button.quantumide-parity-action', { type: 'button' }, localize('quantumide.parity.retry', 'Retry')));
		register({ dispose: () => btn.remove() });
		btn.addEventListener('click', () => void commandService.executeCommand(retryAction.command, ...(retryAction.args ?? [])));
	}
}

export function renderParityLoading(container: HTMLElement, message: string): HTMLElement {
	return append(container, $('.quantumide-parity-loading', { 'aria-busy': 'true' }, message));
}

export function renderParityActions(container: HTMLElement, actions: readonly IParityUiAction[], commandService: ICommandService, register: (d: IDisposable) => void): void {
	const row = append(container, $('.quantumide-parity-actions'));
	for (const action of actions) {
		const btn = append(row, $('button.quantumide-parity-action', {
			type: 'button',
			disabled: action.disabled ? '' : undefined,
			'aria-disabled': action.disabled ? 'true' : undefined,
		}, action.label));
		if (!action.disabled) {
			const listener = () => void commandService.executeCommand(action.command, ...(action.args ?? []));
			btn.addEventListener('click', listener);
			register({ dispose: () => btn.removeEventListener('click', listener) });
		}
	}
}

export function renderParityCard(
	container: HTMLElement,
	title: string,
	body: string,
	actions: readonly IParityUiAction[],
	commandService: ICommandService,
	register: (d: IDisposable) => void,
): void {
	const card = append(container, $('.quantumide-parity-card'));
	append(card, $('div.quantumide-parity-card-title', {}, title));
	append(card, $('div.quantumide-parity-card-body', {}, body));
	renderParityActions(card, actions, commandService, register);
}

export class ParityHierarchicalTree extends Disposable {
	private readonly _rootEl: HTMLElement;
	private readonly _expanded = new Set<string>();
	private _nodes: readonly IParityTreeNode[] = [];
	private _loading = false;
	private _error: string | undefined;
	private _selected = new Set<string>();

	constructor(
		parent: HTMLElement,
		_commandService: ICommandService,
		private readonly _onOpen: (node: IParityTreeNode) => void,
		private readonly _onContextMenu?: (node: IParityTreeNode, actions: readonly IParityUiAction[]) => void,
		private readonly _onToggleExpand?: (nodeId: string, expanded: boolean) => void,
	) {
		super();
		this._rootEl = append(parent, $('.quantumide-parity-hierarchy'));
		this._rootEl.setAttribute('role', 'tree');
		this._rootEl.tabIndex = 0;
		this._register({ dispose: () => this._rootEl.remove() });
	}

	setExpandedPaths(paths: readonly string[]): void {
		this._expanded.clear();
		for (const p of paths) {
			this._expanded.add(p);
		}
	}

	getExpandedPaths(): readonly string[] {
		return [...this._expanded];
	}

	setNodes(nodes: readonly IParityTreeNode[], options?: { loading?: boolean; error?: string }): void {
		this._nodes = nodes;
		this._loading = !!options?.loading;
		this._error = options?.error;
		this._render();
	}

	private _render(): void {
		clearNode(this._rootEl);
		if (this._loading) {
			renderParityLoading(this._rootEl, localize('quantumide.parity.tree.loading', 'Loading…'));
			return;
		}
		if (this._error) {
			renderParityErrorBanner(this._rootEl, this._error);
			return;
		}
		if (!this._nodes.length) {
			append(this._rootEl, $('p.quantumide-parity-empty', {}, localize('quantumide.parity.tree.empty', 'Nothing to show.')));
			return;
		}
		const ul = append(this._rootEl, $('ul.quantumide-parity-hierarchy-root', { role: 'group' }));
		for (const node of this._nodes) {
			this._renderNode(ul, node, 0);
		}
	}

	private _renderNode(parent: HTMLElement, node: IParityTreeNode, depth: number): void {
		const li = append(parent, $('li.quantumide-parity-hierarchy-node', { role: 'treeitem' }));
		li.style.paddingLeft = `${depth * 12}px`;
		const row = append(li, $('.quantumide-parity-hierarchy-row'));
		const hasChildren = node.isDirectory || (node.children?.length ?? 0) > 0;
		const expanded = this._expanded.has(node.id);

		if (hasChildren) {
			const toggle = append(row, $('button.quantumide-parity-tree-toggle', {
				type: 'button',
				'aria-expanded': expanded ? 'true' : 'false',
				'aria-label': expanded
					? localize('quantumide.parity.tree.collapse', 'Collapse {0}', node.label)
					: localize('quantumide.parity.tree.expand', 'Expand {0}', node.label),
			}, expanded ? '▼' : '▶'));
			this._register({ dispose: () => toggle.remove() });
			toggle.addEventListener('click', (e) => {
				e.stopPropagation();
				if (expanded) {
					this._expanded.delete(node.id);
				} else {
					this._expanded.add(node.id);
				}
				this._onToggleExpand?.(node.id, !expanded);
				this._render();
			});
		} else {
			append(row, $('span.quantumide-parity-tree-spacer'));
		}

		const icon = node.isDirectory ? '📁' : '📄';
		const labelBtn = append(row, $('button.quantumide-parity-hierarchy-label', {
			type: 'button',
			title: node.path,
		}, `${icon} ${node.label}`));
		if (node.badge) {
			append(row, $('span.quantumide-parity-badge', {}, node.badge));
		}
		if (node.status) {
			li.classList.add(`quantumide-parity-status-${node.status}`);
		}
		if (this._selected.has(node.id)) {
			li.classList.add('quantumide-parity-selected');
		}

		const open = () => this._onOpen(node);
		labelBtn.addEventListener('click', open);
		labelBtn.addEventListener('dblclick', open);
		labelBtn.addEventListener('contextmenu', (e) => {
			e.preventDefault();
			if (this._onContextMenu) {
				const actions = this._defaultContextActions(node);
				this._onContextMenu(node, actions);
			}
		});
		this._register({ dispose: () => { labelBtn.removeEventListener('click', open); } });

		if (hasChildren && expanded) {
			const childUl = append(li, $('ul', { role: 'group' }));
			const children = node.children ?? [];
			for (const child of children) {
				this._renderNode(childUl, child, depth + 1);
			}
		}
	}

	private _defaultContextActions(node: IParityTreeNode): readonly IParityUiAction[] {
		const actions: IParityUiAction[] = [
			{ label: localize('quantumide.parity.ctx.open', 'Open'), command: 'vscode.open', args: node.resourceUri ? [node.resourceUri] : undefined },
			{ label: localize('quantumide.parity.ctx.reveal', 'Reveal in Explorer'), command: 'revealInExplorer', args: node.resourceUri ? [node.resourceUri] : undefined },
		];
		if (node.isDirectory) {
			actions.push(
				{ label: localize('quantumide.parity.ctx.newFile', 'New File…'), command: 'explorer.newFile', args: node.resourceUri ? [node.resourceUri] : undefined },
			);
		}
		return actions.filter(a => a.args !== undefined);
	}
}
