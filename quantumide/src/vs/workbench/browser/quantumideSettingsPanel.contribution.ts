/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import './media/quantumideSettingsPanel.css';
import { $, append, clearNode, Dimension, addDisposableListener } from '../../base/browser/dom.js';
import { Event } from '../../base/common/event.js';
import { CancellationToken } from '../../base/common/cancellation.js';
import { DisposableStore } from '../../base/common/lifecycle.js';
import { Orientation, Sizing, SplitView } from '../../base/browser/ui/splitview/splitview.js';
import { Codicon } from '../../base/common/codicons.js';
import { ThemeIcon } from '../../base/common/themables.js';
import { URI } from '../../base/common/uri.js';
import { localize, localize2 } from '../../nls.js';
import { Action2, registerAction2 } from '../../platform/actions/common/actions.js';
import { IInstantiationService, ServicesAccessor } from '../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../platform/registry/common/platform.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from './editor.js';
import { EditorExtensions, IEditorFactoryRegistry, IEditorSerializer } from '../common/editor.js';
import { EditorInput } from '../common/editor/editorInput.js';
import { EditorPane } from './parts/editor/editorPane.js';
import { IEditorGroup } from '../services/editor/common/editorGroupsService.js';
import { ITelemetryService } from '../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../platform/theme/common/themeService.js';
import { IStorageService, StorageScope, StorageTarget } from '../../platform/storage/common/storage.js';
import { IEditorOpenContext } from '../common/editor.js';
import { IEditorOptions } from '../../platform/editor/common/editor.js';
import { SyncDescriptor } from '../../platform/instantiation/common/descriptors.js';
import {
	QuantumIDEAICommandId,
	QUANTUMIDE_SETTINGS_PANEL_STORAGE_KEY,
	type QuantumIDEChatSettingsCategory,
} from '../../platform/quantumide/common/quantumideAISettings.js';
import { QUANTUMIDE_SETTINGS_CATEGORIES } from '../../platform/quantumide/common/quantumideSettingsMetadata.js';
import {
	buildQuantumIDESettingsPreviewLines,
	QUANTUMIDE_SETTINGS_PREVIEW_KEYS,
} from '../../platform/quantumide/common/quantumideSettingsPreview.js';
import { SettingsEditor2 } from '../contrib/preferences/browser/settingsEditor2.js';
import { SettingsEditor2Input } from '../services/preferences/common/preferencesEditorInput.js';
import { IEditorService } from '../services/editor/common/editorService.js';
import { SETTINGS_QUERIES } from './quantumideSettingsQueries.js';
import { IConfigurationService } from '../../platform/configuration/common/configuration.js';
import { ICommandService } from '../../platform/commands/common/commands.js';

interface ICategoryToolbarAction {
	readonly label: string;
	readonly commandId: string;
}

const CATEGORY_TOOLBAR_ACTIONS: Partial<Record<QuantumIDEChatSettingsCategory, readonly ICategoryToolbarAction[]>> = {
	indexing: [
		{ label: localize('quantumide.settings.reindex', 'Reindex'), commandId: QuantumIDEAICommandId.ReindexWorkspace },
		{ label: localize('quantumide.settings.inspectCache', 'Inspect cache'), commandId: QuantumIDEAICommandId.InspectIndexCache },
		{ label: localize('quantumide.settings.clearCache', 'Clear cache'), commandId: QuantumIDEAICommandId.ClearIndexCache },
	],
	models: [
		{ label: localize('quantumide.settings.storeApiKey', 'Store API key'), commandId: QuantumIDEAICommandId.StoreOpenAIApiKey },
		{ label: localize('quantumide.settings.testConnection', 'Test connection'), commandId: QuantumIDEAICommandId.TestOpenAIConnection },
		{ label: localize('quantumide.settings.refreshModels', 'Refresh models'), commandId: QuantumIDEAICommandId.RefreshOpenAIModels },
	],
	keybindings: [
		{ label: localize('quantumide.settings.openKeybindings', 'Open shortcuts'), commandId: 'workbench.action.openGlobalKeybindings' },
		{ label: localize('quantumide.settings.workspaceKeybindings', 'Workspace overrides'), commandId: 'quantumide.settings.openWorkspaceKeybindings' },
		{ label: localize('quantumide.settings.detectConflicts', 'Detect conflicts'), commandId: QuantumIDEAICommandId.DetectKeybindingConflicts },
		{ label: localize('quantumide.settings.importKeybindings', 'Import'), commandId: 'quantumide.settings.importKeybindings' },
		{ label: localize('quantumide.settings.exportKeybindings', 'Export'), commandId: 'quantumide.settings.exportKeybindings' },
	],
	extensions: [
		{ label: localize('quantumide.settings.openMcp', 'MCP servers'), commandId: 'workbench.view.mcp' },
	],
	agent: [
		{ label: localize('quantumide.settings.providerStatus', 'Provider status'), commandId: QuantumIDEAICommandId.ShowProviderStatus },
	],
	experimental: [
		{ label: localize('quantumide.settings.performanceReport', 'Performance report'), commandId: QuantumIDEAICommandId.ShowPerformanceReport },
	],
};

export async function openQuantumIDESettingsPanel(accessor: ServicesAccessor, category: QuantumIDEChatSettingsCategory): Promise<void> {
	await accessor.get(IEditorService).openEditor(new QuantumIDESettingsPanelInput(category));
}

export class QuantumIDESettingsPanelInput extends EditorInput {
	static readonly ID = 'workbench.input.quantumideSettingsPanel';
	static readonly SCHEME = 'quantumide-settings-panel';

	readonly resource = URI.from({ scheme: QuantumIDESettingsPanelInput.SCHEME, path: 'panel' });

	constructor(readonly initialCategory: QuantumIDEChatSettingsCategory = 'general') {
		super();
	}

	override get typeId(): string {
		return QuantumIDESettingsPanelInput.ID;
	}

	override getName(): string {
		return localize('quantumide.settings.panelName', 'QuantumIDE Settings');
	}

	override getIcon(): ThemeIcon {
		return Codicon.settingsGear;
	}
}

class QuantumIDESettingsPanelEditor extends EditorPane {
	static readonly ID = 'workbench.editor.quantumideSettingsPanel';

	private _outerSplit: SplitView | undefined;
	private _innerSplit: SplitView | undefined;
	private _navContainer: HTMLElement | undefined;
	private _toolbarContainer: HTMLElement | undefined;
	private _settingsContainer: HTMLElement | undefined;
	private _searchInput: HTMLInputElement | undefined;
	private _previewEl: HTMLElement | undefined;
	private _descriptionEl: HTMLElement | undefined;
	private _actionsEl: HTMLElement | undefined;
	private _embeddedSettings: SettingsEditor2 | undefined;
	private _activeCategory: QuantumIDEChatSettingsCategory = 'general';
	private _searchQuery = '';
	private readonly _disposables = this._register(new DisposableStore());
	private _navItems = new Map<QuantumIDEChatSettingsCategory, HTMLElement>();

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService private readonly _storageService: IStorageService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ICommandService private readonly _commandService: ICommandService,
	) {
		super(QuantumIDESettingsPanelEditor.ID, group, telemetryService, themeService, _storageService);
	}

	protected override createEditor(parent: HTMLElement): void {
		parent.classList.add('quantumide-settings-panel-root');
		this._outerSplit = new SplitView(parent, { orientation: Orientation.HORIZONTAL });
		this._navContainer = $('.quantumide-settings-panel-nav');
		this._navContainer.setAttribute('role', 'navigation');
		this._navContainer.setAttribute('aria-label', localize('quantumide.settings.navAria', 'Settings categories'));

		const rightColumn = $('.quantumide-settings-panel-right');
		this._innerSplit = new SplitView(rightColumn, { orientation: Orientation.VERTICAL });
		this._toolbarContainer = $('.quantumide-settings-panel-toolbar');
		this._settingsContainer = $('.quantumide-settings-panel-main');

		this._outerSplit.addView({
			onDidChange: Event.None,
			element: this._navContainer,
			minimumSize: 180,
			maximumSize: 320,
			layout: width => { this._navContainer!.style.width = `${width}px`; },
		}, 220, undefined, true);
		this._outerSplit.addView({
			onDidChange: Event.None,
			element: rightColumn,
			minimumSize: 400,
			maximumSize: Number.POSITIVE_INFINITY,
			layout: width => { rightColumn.style.width = `${width}px`; },
		}, Sizing.Distribute, undefined, true);

		this._innerSplit.addView({
			onDidChange: Event.None,
			element: this._toolbarContainer,
			minimumSize: 72,
			maximumSize: 200,
			layout: height => { this._toolbarContainer!.style.height = `${height}px`; },
		}, 120, undefined, true);
		this._innerSplit.addView({
			onDidChange: Event.None,
			element: this._settingsContainer,
			minimumSize: 200,
			maximumSize: Number.POSITIVE_INFINITY,
			layout: height => { this._settingsContainer!.style.height = `${height}px`; },
		}, Sizing.Distribute, undefined, true);

		this._buildToolbar();
		this._renderNav();
		this._embeddedSettings = this._instantiationService.createInstance(SettingsEditor2, this.group);
		this._embeddedSettings.create(this._settingsContainer);

		const stored = this._storageService.get(QUANTUMIDE_SETTINGS_PANEL_STORAGE_KEY, StorageScope.APPLICATION) as QuantumIDEChatSettingsCategory | undefined;
		if (stored && QUANTUMIDE_SETTINGS_CATEGORIES.some(c => c.id === stored)) {
			this._activeCategory = stored;
		}

		this._disposables.add(this._configurationService.onDidChangeConfiguration(e => {
			const keys = QUANTUMIDE_SETTINGS_PREVIEW_KEYS[this._activeCategory];
			if (!keys?.some(key => e.affectsConfiguration(key))) {
				return;
			}
			this._updatePreview();
		}));
	}

	override async setInput(input: EditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);
		if (input instanceof QuantumIDESettingsPanelInput) {
			this._activeCategory = input.initialCategory;
		}
		this._persistCategory();
		this._highlightNav();
		this._filterNav();
		this._renderCategoryChrome();
		await this._openCategory(this._activeCategory);
	}

	override layout(dimension: Dimension): void {
		this._outerSplit?.layout(dimension.width);
		if (this._innerSplit) {
			this._innerSplit.layout(dimension.height);
		}
		this._embeddedSettings?.layout(new Dimension(dimension.width, Math.max(0, dimension.height - 120)));
	}

	private _buildToolbar(): void {
		if (!this._toolbarContainer) {
			return;
		}
		const searchRow = append(this._toolbarContainer, $('.quantumide-settings-panel-search-row'));
		const searchLabel = append(searchRow, $('label.quantumide-settings-panel-search-label'));
		searchLabel.textContent = localize('quantumide.settings.search', 'Search settings');
		this._searchInput = append(searchRow, $('input.quantumide-settings-panel-search')) as HTMLInputElement;
		this._searchInput.type = 'search';
		this._searchInput.placeholder = localize('quantumide.settings.searchPlaceholder', 'Filter categories or settings…');
		this._searchInput.setAttribute('aria-label', localize('quantumide.settings.searchAria', 'Search settings'));
		this._disposables.add(addDisposableListener(this._searchInput, 'input', () => {
			this._searchQuery = this._searchInput?.value.trim().toLowerCase() ?? '';
			this._filterNav();
		}));
		this._disposables.add(addDisposableListener(this._searchInput, 'keydown', e => {
			if (e.key === 'Enter') {
				void this._openCategory(this._activeCategory, this._searchQuery);
			}
		}));

		this._descriptionEl = append(this._toolbarContainer, $('.quantumide-settings-panel-description'));
		this._actionsEl = append(this._toolbarContainer, $('.quantumide-settings-panel-actions'));
		this._previewEl = append(this._toolbarContainer, $('.quantumide-settings-panel-preview'));
		this._previewEl.setAttribute('role', 'status');
		this._previewEl.setAttribute('aria-live', 'polite');
	}

	private _renderNav(): void {
		if (!this._navContainer) {
			return;
		}
		clearNode(this._navContainer);
		this._navItems.clear();
		const title = append(this._navContainer, $('h2.quantumide-settings-panel-title'));
		title.textContent = localize('quantumide.settings.panelTitle', 'QuantumIDE Settings');
		const list = append(this._navContainer, $('ul.quantumide-settings-panel-list'));
		list.setAttribute('role', 'listbox');
		for (const category of QUANTUMIDE_SETTINGS_CATEGORIES) {
			const item = append(list, $('li.quantumide-settings-panel-item'));
			item.textContent = category.title;
			item.dataset.category = category.id;
			item.setAttribute('role', 'option');
			item.tabIndex = 0;
			item.title = category.description;
			this._navItems.set(category.id, item);
			item.onclick = () => this._selectCategory(category.id);
			this._disposables.add(addDisposableListener(item, 'keydown', e => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					this._selectCategory(category.id);
				} else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
					e.preventDefault();
					this._focusAdjacentNav(category.id, e.key === 'ArrowDown' ? 1 : -1);
				}
			}));
		}
		this._highlightNav();
		this._filterNav();
	}

	private _focusAdjacentNav(current: QuantumIDEChatSettingsCategory, delta: number): void {
		const visible = QUANTUMIDE_SETTINGS_CATEGORIES
			.map(c => c.id)
			.filter(id => {
				const el = this._navItems.get(id);
				return el && el.style.display !== 'none';
			});
		const idx = visible.indexOf(current);
		const next = visible[Math.max(0, Math.min(visible.length - 1, idx + delta))];
		if (next) {
			this._navItems.get(next)?.focus();
		}
	}

	private _selectCategory(category: QuantumIDEChatSettingsCategory): void {
		this._activeCategory = category;
		this._persistCategory();
		this._highlightNav();
		this._renderCategoryChrome();
		void this._openCategory(category, this._searchQuery);
	}

	private _persistCategory(): void {
		this._storageService.store(
			QUANTUMIDE_SETTINGS_PANEL_STORAGE_KEY,
			this._activeCategory,
			StorageScope.APPLICATION,
			StorageTarget.USER,
		);
	}

	private _highlightNav(): void {
		for (const [id, item] of this._navItems) {
			const active = id === this._activeCategory;
			item.classList.toggle('active', active);
			item.setAttribute('aria-selected', active ? 'true' : 'false');
		}
	}

	private _filterNav(): void {
		const q = this._searchQuery;
		for (const meta of QUANTUMIDE_SETTINGS_CATEGORIES) {
			const item = this._navItems.get(meta.id);
			if (!item) {
				continue;
			}
			const haystack = `${meta.title} ${meta.description} ${meta.searchHint}`.toLowerCase();
			const match = !q || haystack.includes(q);
			item.style.display = match ? '' : 'none';
		}
	}

	private _renderCategoryChrome(): void {
		const meta = QUANTUMIDE_SETTINGS_CATEGORIES.find(c => c.id === this._activeCategory);
		if (this._descriptionEl && meta) {
			this._descriptionEl.textContent = meta.description;
		}
		if (this._actionsEl) {
			clearNode(this._actionsEl);
			const actions = CATEGORY_TOOLBAR_ACTIONS[this._activeCategory] ?? [];
			for (const action of actions) {
				const btn = append(this._actionsEl, $('button.quantumide-settings-panel-action')) as HTMLButtonElement;
				btn.textContent = action.label;
				btn.type = 'button';
				this._disposables.add(addDisposableListener(btn, 'click', () => {
					void this._commandService.executeCommand(action.commandId);
				}));
			}
		}
		this._updatePreview();
	}

	private _updatePreview(): void {
		if (!this._previewEl) {
			return;
		}
		const keys = QUANTUMIDE_SETTINGS_PREVIEW_KEYS[this._activeCategory];
		const values: Record<string, unknown> = {};
		if (keys) {
			for (const key of keys) {
				values[key] = this._configurationService.getValue(key);
			}
		}
		const lines = buildQuantumIDESettingsPreviewLines(this._activeCategory, values);
		clearNode(this._previewEl);
		const heading = append(this._previewEl, $('strong'));
		heading.textContent = localize('quantumide.settings.livePreview', 'Live preview');
		for (const line of lines) {
			const row = append(this._previewEl, $('div'));
			row.textContent = line;
		}
	}

	private async _openCategory(category: QuantumIDEChatSettingsCategory, extraSearch?: string): Promise<void> {
		if (!this._embeddedSettings) {
			return;
		}
		let query = SETTINGS_QUERIES[category] ?? '';
		if (extraSearch) {
			query = `${query} ${extraSearch}`;
		}
		const settingsInput = this._instantiationService.createInstance(SettingsEditor2Input);
		await this._embeddedSettings.setInput(settingsInput, { query }, {} as IEditorOpenContext, CancellationToken.None);
	}

	override focus(): void {
		this._searchInput?.focus();
	}
}

class QuantumIDESettingsPanelInputSerializer implements IEditorSerializer {
	canSerialize(editor: EditorInput): boolean {
		return editor instanceof QuantumIDESettingsPanelInput;
	}
	serialize(editor: EditorInput): string {
		if (editor instanceof QuantumIDESettingsPanelInput) {
			return JSON.stringify({ category: editor.initialCategory });
		}
		return '';
	}
	deserialize(_instantiationService: IInstantiationService, serialized: string): QuantumIDESettingsPanelInput {
		try {
			const parsed = JSON.parse(serialized) as { category?: QuantumIDEChatSettingsCategory };
			if (parsed?.category) {
				return new QuantumIDESettingsPanelInput(parsed.category);
			}
		} catch {
			// ignore
		}
		return new QuantumIDESettingsPanelInput();
	}
}

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		QuantumIDESettingsPanelEditor,
		QuantumIDESettingsPanelEditor.ID,
		localize('quantumide.settings.panelEditor', 'QuantumIDE Settings Panel'),
	),
	[new SyncDescriptor(QuantumIDESettingsPanelInput)],
);
Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(QuantumIDESettingsPanelInput.ID, QuantumIDESettingsPanelInputSerializer);

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: QuantumIDEAICommandId.OpenSettingsPanel,
			title: localize2('quantumide.settings.openPanel', 'Open QuantumIDE Settings Panel'),
			category: { value: localize('quantumide.settings.category', 'QuantumIDE Settings'), original: 'QuantumIDE Settings' },
			f1: true,
		});
	}
	override async run(accessor: ServicesAccessor): Promise<void> {
		await openQuantumIDESettingsPanel(accessor, 'general');
	}
});
