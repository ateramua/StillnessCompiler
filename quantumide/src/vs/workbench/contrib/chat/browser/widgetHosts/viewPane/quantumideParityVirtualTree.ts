/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { $, append, clearNode } from '../../../../../../base/browser/dom.js';
import { Disposable, IDisposable } from '../../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../../nls.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { URI } from '../../../../../../base/common/uri.js';
import {
	IParityTreeNode,
	IParityUiAction,
	renderParityErrorBanner,
	renderParityLoading,
} from './quantumideChatParityUi.js';

const ROW_HEIGHT_PX = 22;
const VIRTUAL_OVERSCAN = 8;
const URI_MIME = 'application/vnd.quantumide.resource-uri';

export interface IParityVirtualTreeOptions {
	readonly filterQuery?: string;
	readonly onFilterChange?: (query: string) => void;
	readonly onMove?: (sources: readonly URI[], targetDirectory: URI) => void | Promise<void>;
	readonly virtualized?: boolean;
}

interface IFlatTreeRow {
	readonly node: IParityTreeNode;
	readonly depth: number;
}

export class ParityVirtualTree extends Disposable {
	private readonly _viewport: HTMLElement;
	private readonly _inner: HTMLElement;
	private readonly _expanded = new Set<string>();
	private readonly _selected = new Set<string>();
	private _nodes: readonly IParityTreeNode[] = [];
	private _flatRows: IFlatTreeRow[] = [];
	private _loading = false;
	private _error: string | undefined;
	private _focusIndex = 0;
	private _lastAnchorIndex = 0;
	private _dragSourceUri: URI | undefined;
	private _options: IParityVirtualTreeOptions = {};

	constructor(
		parent: HTMLElement,
		private readonly _commandService: ICommandService,
		private readonly _onOpen: (node: IParityTreeNode) => void,
		private readonly _onContextMenu?: (node: IParityTreeNode, actions: readonly IParityUiAction[]) => void,
		private readonly _onToggleExpand?: (nodeId: string, expanded: boolean) => void,
	) {
		super();
		const root = append(parent, $('.quantumide-parity-hierarchy'));
		root.setAttribute('role', 'tree');
		root.tabIndex = 0;
		root.classList.add('quantumide-parity-tree-root-focus');
		this._viewport = append(root, $('.quantumide-parity-tree-viewport'));
		this._inner = append(this._viewport, $('.quantumide-parity-tree-inner'));
		this._register({ dispose: () => root.remove() });
		this._register(this._attachKeyboard(root));
		this._register(this._attachScroll());
	}

	setOptions(options: IParityVirtualTreeOptions): void {
		this._options = options;
	}

	setExpandedPaths(paths: readonly string[]): void {
		this._expanded.clear();
		for (const p of paths) {
			this._expanded.add(p);
		}
	}

	getSelectedUris(): readonly URI[] {
		const uris: URI[] = [];
		for (const row of this._flatRows) {
			if (this._selected.has(row.node.id) && row.node.resourceUri) {
				uris.push(row.node.resourceUri);
			}
		}
		return uris;
	}

	setNodes(nodes: readonly IParityTreeNode[], options?: { loading?: boolean; error?: string }): void {
		this._nodes = nodes;
		this._loading = !!options?.loading;
		this._error = options?.error;
		this._rebuildFlat();
		this._render();
	}

	private _rebuildFlat(): void {
		if (this._options.filterQuery?.trim()) {
			this._flatRows = this._nodes.map(node => ({ node, depth: 0 }));
			return;
		}
		this._flatRows = [];
		const walk = (list: readonly IParityTreeNode[], depth: number) => {
			for (const node of list) {
				this._flatRows.push({ node, depth });
				const hasChildren = node.isDirectory || (node.children?.length ?? 0) > 0;
				if (hasChildren && this._expanded.has(node.id) && node.children) {
					walk(node.children, depth + 1);
				}
			}
		};
		walk(this._nodes, 0);
		if (this._focusIndex >= this._flatRows.length) {
			this._focusIndex = Math.max(0, this._flatRows.length - 1);
		}
	}

	private _render(): void {
		clearNode(this._inner);
		if (this._loading) {
			renderParityLoading(this._inner, localize('quantumide.parity.tree.loading', 'Loading…'));
			return;
		}
		if (this._error) {
			renderParityErrorBanner(this._inner, this._error, {
				label: localize('quantumide.parity.tree.refresh', 'Refresh'),
				command: 'quantumide.fileTree.refresh',
			}, this._commandService, d => this._register(d));
			return;
		}
		if (!this._flatRows.length) {
			append(this._inner, $('p.quantumide-parity-empty', {}, localize('quantumide.parity.tree.empty', 'Nothing to show.')));
			return;
		}

		const useVirtual = this._options.virtualized !== false && this._flatRows.length > 40;
		if (!useVirtual) {
			this._inner.style.height = '';
			this._inner.style.position = '';
			for (let i = 0; i < this._flatRows.length; i++) {
				this._renderRow(this._inner, this._flatRows[i], i, false);
			}
			return;
		}

		const totalHeight = this._flatRows.length * ROW_HEIGHT_PX;
		this._inner.style.height = `${totalHeight}px`;
		this._inner.style.position = 'relative';

		const scrollTop = this._viewport.scrollTop;
		const viewHeight = this._viewport.clientHeight || 200;
		const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT_PX) - VIRTUAL_OVERSCAN);
		const visibleCount = Math.ceil(viewHeight / ROW_HEIGHT_PX) + VIRTUAL_OVERSCAN * 2;
		const end = Math.min(this._flatRows.length, start + visibleCount);

		for (let i = start; i < end; i++) {
			this._renderRow(this._inner, this._flatRows[i], i, true);
		}
	}

	private _renderRow(parent: HTMLElement, row: IFlatTreeRow, index: number, absolute: boolean): void {
		const { node, depth } = row;
		const li = append(parent, $('div.quantumide-parity-hierarchy-node', { role: 'treeitem' }));
		if (absolute) {
			li.style.position = 'absolute';
			li.style.top = `${index * ROW_HEIGHT_PX}px`;
			li.style.left = '0';
			li.style.right = '0';
			li.style.height = `${ROW_HEIGHT_PX}px`;
		}
		li.style.paddingLeft = `${depth * 12 + 4}px`;
		const rowEl = append(li, $('.quantumide-parity-hierarchy-row'));
		const hasChildren = node.isDirectory || (node.children?.length ?? 0) > 0;
		const expanded = this._expanded.has(node.id);

		if (hasChildren && !this._options.filterQuery?.trim()) {
			const toggle = append(rowEl, $('button.quantumide-parity-tree-toggle', {
				type: 'button',
				'aria-expanded': expanded ? 'true' : 'false',
			}, expanded ? '▼' : '▶'));
			toggle.addEventListener('click', (e) => {
				e.stopPropagation();
				if (expanded) {
					this._expanded.delete(node.id);
				} else {
					this._expanded.add(node.id);
				}
				this._onToggleExpand?.(node.id, !expanded);
				this._rebuildFlat();
				this._render();
			});
			this._register({ dispose: () => toggle.remove() });
		} else {
			append(rowEl, $('span.quantumide-parity-tree-spacer'));
		}

		const icon = node.isDirectory ? '📁' : '📄';
		const labelBtn = append(rowEl, $('button.quantumide-parity-hierarchy-label', {
			type: 'button',
			title: node.path,
			draggable: node.resourceUri ? 'true' : 'false',
		}, `${icon} ${node.label}`));

		if (this._selected.has(node.id)) {
			li.classList.add('quantumide-parity-selected');
		}
		if (index === this._focusIndex) {
			li.classList.add('quantumide-parity-focused');
			labelBtn.setAttribute('aria-selected', 'true');
		}
		if (node.status) {
			li.classList.add(`quantumide-parity-status-${node.status}`);
		}

		labelBtn.addEventListener('click', (e) => this._handleSelect(index, node, e));
		labelBtn.addEventListener('dblclick', () => this._onOpen(node));
		labelBtn.addEventListener('contextmenu', (e) => {
			e.preventDefault();
			this._onContextMenu?.(node, this._defaultContextActions(node));
		});

		if (node.resourceUri) {
			this._attachDragDrop(li, rowEl, node, labelBtn);
		}

		this._register({ dispose: () => li.remove() });
	}

	private _attachDragDrop(li: HTMLElement, rowEl: HTMLElement, node: IParityTreeNode, labelBtn: HTMLElement): void {
		const uri = node.resourceUri!;
		labelBtn.addEventListener('dragstart', (e) => {
			this._dragSourceUri = uri;
			const dragUris = this._selected.has(node.id) ? this.getSelectedUris() : [uri];
			e.dataTransfer?.setData(URI_MIME, JSON.stringify(dragUris.map(u => u.toString())));
			e.dataTransfer!.effectAllowed = 'move';
			li.classList.add('quantumide-parity-dragging');
		});
		labelBtn.addEventListener('dragend', () => {
			this._dragSourceUri = undefined;
			li.classList.remove('quantumide-parity-dragging');
			this._viewport.querySelectorAll('.quantumide-parity-drop-target').forEach(el => el.classList.remove('quantumide-parity-drop-target'));
		});

		if (!node.isDirectory) {
			return;
		}

		const onDragOver = (e: DragEvent) => {
			e.preventDefault();
			e.dataTransfer!.dropEffect = 'move';
			rowEl.classList.add('quantumide-parity-drop-target');
		};
		const onDragLeave = () => rowEl.classList.remove('quantumide-parity-drop-target');
		const onDrop = async (e: DragEvent) => {
			e.preventDefault();
			rowEl.classList.remove('quantumide-parity-drop-target');
			if (!this._options.onMove) {
				return;
			}
			let sources: URI[] = [];
			const raw = e.dataTransfer?.getData(URI_MIME);
			if (raw) {
				try {
					sources = (JSON.parse(raw) as string[]).map(s => URI.parse(s));
				} catch {
					sources = [];
				}
			}
			if (!sources.length && this._dragSourceUri) {
				sources = this.getSelectedUris().length ? [...this.getSelectedUris()] : [this._dragSourceUri];
			}
			if (sources.length) {
				await this._options.onMove(sources, uri);
			}
		};
		rowEl.addEventListener('dragover', onDragOver);
		rowEl.addEventListener('dragleave', onDragLeave);
		rowEl.addEventListener('drop', onDrop);
		this._register({
			dispose: () => {
				rowEl.removeEventListener('dragover', onDragOver);
				rowEl.removeEventListener('dragleave', onDragLeave);
				rowEl.removeEventListener('drop', onDrop);
			},
		});
	}

	private _handleSelect(index: number, node: IParityTreeNode, e: MouseEvent): void {
		const multi = e.metaKey || e.ctrlKey;
		const range = e.shiftKey;
		if (range && this._flatRows.length) {
			const from = Math.min(this._lastAnchorIndex, index);
			const to = Math.max(this._lastAnchorIndex, index);
			if (!multi) {
				this._selected.clear();
			}
			for (let i = from; i <= to; i++) {
				this._selected.add(this._flatRows[i].node.id);
			}
		} else if (multi) {
			if (this._selected.has(node.id)) {
				this._selected.delete(node.id);
			} else {
				this._selected.add(node.id);
			}
			this._lastAnchorIndex = index;
		} else {
			this._selected.clear();
			this._selected.add(node.id);
			this._lastAnchorIndex = index;
		}
		this._focusIndex = index;
		this._render();
	}

	private _attachKeyboard(root: HTMLElement): IDisposable {
		const onKeyDown = (e: KeyboardEvent) => {
			if (!this._flatRows.length) {
				return;
			}
			const row = this._flatRows[this._focusIndex];
			if (!row) {
				return;
			}
			switch (e.key) {
				case 'ArrowDown':
					e.preventDefault();
					this._focusIndex = Math.min(this._flatRows.length - 1, this._focusIndex + 1);
					this._render();
					this._scrollFocusIntoView();
					break;
				case 'ArrowUp':
					e.preventDefault();
					this._focusIndex = Math.max(0, this._focusIndex - 1);
					this._render();
					this._scrollFocusIntoView();
					break;
				case 'ArrowRight':
					e.preventDefault();
					if (row.node.isDirectory && !this._expanded.has(row.node.id)) {
						this._expanded.add(row.node.id);
						this._onToggleExpand?.(row.node.id, true);
						this._rebuildFlat();
						this._render();
					}
					break;
				case 'ArrowLeft':
					e.preventDefault();
					if (row.node.isDirectory && this._expanded.has(row.node.id)) {
						this._expanded.delete(row.node.id);
						this._onToggleExpand?.(row.node.id, false);
						this._rebuildFlat();
						this._render();
					}
					break;
				case 'Enter':
					e.preventDefault();
					this._onOpen(row.node);
					break;
				case ' ':
					e.preventDefault();
					if (row.node.isDirectory) {
						const exp = this._expanded.has(row.node.id);
						if (exp) {
							this._expanded.delete(row.node.id);
						} else {
							this._expanded.add(row.node.id);
						}
						this._onToggleExpand?.(row.node.id, !exp);
						this._rebuildFlat();
						this._render();
					}
					break;
			}
		};
		root.addEventListener('keydown', onKeyDown);
		return { dispose: () => root.removeEventListener('keydown', onKeyDown) };
	}

	private _attachScroll(): IDisposable {
		const onScroll = () => {
			if (this._flatRows.length > 40) {
				this._render();
			}
		};
		this._viewport.addEventListener('scroll', onScroll);
		return { dispose: () => this._viewport.removeEventListener('scroll', onScroll) };
	}

	private _scrollFocusIntoView(): void {
		const top = this._focusIndex * ROW_HEIGHT_PX;
		const bottom = top + ROW_HEIGHT_PX;
		if (top < this._viewport.scrollTop) {
			this._viewport.scrollTop = top;
		} else if (bottom > this._viewport.scrollTop + this._viewport.clientHeight) {
			this._viewport.scrollTop = bottom - this._viewport.clientHeight;
		}
	}

	private _defaultContextActions(node: IParityTreeNode): readonly IParityUiAction[] {
		const actions: IParityUiAction[] = [
			{ label: localize('quantumide.parity.ctx.open', 'Open'), command: 'vscode.open', args: node.resourceUri ? [node.resourceUri] : undefined },
			{ label: localize('quantumide.parity.ctx.reveal', 'Reveal in Explorer'), command: 'revealInExplorer', args: node.resourceUri ? [node.resourceUri] : undefined },
		];
		if (node.resourceUri) {
			actions.push(
				{ label: localize('quantumide.parity.ctx.rename', 'Rename…'), command: 'quantumide.fileTree.rename', args: [node.resourceUri.toString()] },
				{ label: localize('quantumide.parity.ctx.delete', 'Delete'), command: 'quantumide.fileTree.delete', args: [node.resourceUri.toString()] },
			);
		}
		if (node.isDirectory && node.resourceUri) {
			actions.push(
				{ label: localize('quantumide.parity.ctx.newFile', 'New File…'), command: 'explorer.newFile', args: [node.resourceUri] },
			);
		}
		return actions.filter(a => a.args !== undefined);
	}
}

export function renderParityTreeFilterRow(
	parent: HTMLElement,
	query: string,
	onChange: (q: string) => void,
	register: (d: IDisposable) => void,
): void {
	const row = append(parent, $('.quantumide-parity-filter-row'));
	const input = append(row, $('input.quantumide-parity-filter', {
		type: 'search',
		placeholder: localize('quantumide.parity.files.filter', 'Filter files…'),
		value: query,
		'aria-label': localize('quantumide.parity.files.filter', 'Filter files'),
	})) as HTMLInputElement;
	const onInput = () => onChange(input.value);
	input.addEventListener('input', onInput);
	register({ dispose: () => { input.removeEventListener('input', onInput); input.remove(); } });
}
