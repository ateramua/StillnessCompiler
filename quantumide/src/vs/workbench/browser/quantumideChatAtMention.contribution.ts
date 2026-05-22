/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../base/common/cancellation.js';
import { Disposable } from '../../base/common/lifecycle.js';
import { Schemas } from '../../base/common/network.js';
import { basename } from '../../base/common/path.js';
import { URI } from '../../base/common/uri.js';
import { Position } from '../../editor/common/core/position.js';
import { CompletionItemKind, CompletionItemInsertTextRule, type CompletionContext, type CompletionList } from '../../editor/common/languages.js';
import { ITextModel } from '../../editor/common/model.js';
import { localize } from '../../nls.js';
import { CommandsRegistry } from '../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../platform/configuration/common/configuration.js';
import { ServicesAccessor } from '../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../platform/label/common/label.js';
import { isQuantumIDEProduct } from '../../platform/quantumide/common/quantumideChatPlatform.js';
import { QuantumIDEAISettingId } from '../../platform/quantumide/common/quantumideAISettings.js';
import { quantumideFuzzyMatchFilePaths } from '../../platform/quantumide/common/quantumideFuzzyFileMatch.js';
import { isQuantumIDEPathIgnored } from '../../platform/quantumide/common/quantumideWorkspaceIgnore.js';
import product from '../../platform/product/common/product.js';
import { ILanguageFeaturesService } from '../../editor/common/services/languageFeatures.js';
import { ICodeEditorService } from '../../editor/browser/services/codeEditorService.js';
import { IEditorService } from '../services/editor/common/editorService.js';
import { IWorkspaceContextService } from '../../platform/workspace/common/workspace.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../common/contributions.js';
import { ChatDynamicVariableModel } from '../contrib/chat/browser/attachments/chatDynamicVariables.js';
import { IChatWidget, IChatWidgetService } from '../contrib/chat/browser/chat.js';
import { chatVariableLeader } from '../contrib/chat/common/requestParser/chatParserTypes.js';
import { computeCompletionRanges, escapeForCharClass } from '../contrib/chat/browser/widget/input/editor/chatInputCompletionUtils.js';
import { toWorkspaceVariableEntry } from '../contrib/chat/common/attachments/chatVariableEntries.js';
import type { IDynamicVariable } from '../contrib/chat/common/attachments/chatVariables.js';
import { formatWorkspaceFolderLinks, resolveWorkspaceGraphPath } from '../../platform/quantumide/common/quantumideWorkspaceRoots.js';
import { IQuantumIDEWorkspaceContextService } from '../services/quantumide/common/quantumideWorkspaceContext.js';
import { IQuantumIDEWorkspaceIgnoreService } from '../services/quantumide/common/quantumideWorkspaceIgnoreService.js';

function isQuantumIDE(): boolean {
	return isQuantumIDEProduct(product.applicationName)
		|| [product.nameShort, product.nameLong].some(n => typeof n === 'string' && n.toLowerCase().includes('quantumide'));
}

interface IInsertAttachmentArgs {
	readonly sessionResource: string;
	readonly variable: IDynamicVariable;
}

class QuantumIDEChatAtMentionContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.quantumideChatAtMention';

	/** Warm graph paths filtered by ignore policy (§11: avoid per-keystroke async ignore checks). */
	private _warmPathsCacheKey: string | undefined;
	private _warmPathsCache: readonly string[] | undefined;

	constructor(
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
		@IWorkspaceContextService private readonly _workspace: IWorkspaceContextService,
		@IQuantumIDEWorkspaceContextService private readonly _ctx: IQuantumIDEWorkspaceContextService,
		@IQuantumIDEWorkspaceIgnoreService private readonly _ignore: IQuantumIDEWorkspaceIgnoreService,
		@ILabelService private readonly _labelService: ILabelService,
		@ICodeEditorService private readonly _codeEditorService: ICodeEditorService,
		@IEditorService private readonly _editorService: IEditorService,
		@IConfigurationService private readonly _configuration: IConfigurationService,
	) {
		super();
		if (!isQuantumIDE() || this._configuration.getValue<boolean>(QuantumIDEAISettingId.ChatAttachmentsEnabled) === false) {
			return;
		}

		this._register(this._ctx.onDidChangeGraph(() => {
			const sync = this._ctx.getCachedAtMentionPaths();
			this._warmPathsCacheKey = sync.length > 0 ? `sync:${sync.length}:${this._ctx.getWorkspaceGraph()?.status.generatedAt ?? ''}` : undefined;
			this._warmPathsCache = sync.length > 0 ? sync : undefined;
		}));
		const initialSync = this._ctx.getCachedAtMentionPaths();
		if (initialSync.length > 0) {
			this._warmPathsCacheKey = `sync:${initialSync.length}`;
			this._warmPathsCache = initialSync;
		}
		void this._ignore.getPolicy();
		this._register(this._configuration.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(QuantumIDEAISettingId.IndexingIgnoreFile)
				|| e.affectsConfiguration(QuantumIDEAISettingId.IndexingExcludePatterns)) {
				this._warmPathsCacheKey = undefined;
				this._warmPathsCache = undefined;
			}
		}));

		this._register(CommandsRegistry.registerCommand('quantumide.chat.insertAttachment', (_accessor: ServicesAccessor, args: IInsertAttachmentArgs) => {
			const widget = this._chatWidgetService.getWidgetBySessionResource(URI.parse(args.sessionResource));
			if (!widget) {
				return;
			}
			widget.getContrib<ChatDynamicVariableModel>(ChatDynamicVariableModel.ID)?.addReference(args.variable);
			const workspaceRelativePath = args.variable._meta?.workspaceRelativePath;
			if (typeof workspaceRelativePath === 'string' && workspaceRelativePath.trim()) {
				widget.input.attachmentModel.addContext(toWorkspaceVariableEntry(workspaceRelativePath, args.variable.fullName ?? workspaceRelativePath));
			}
		}));

		const atPattern = /@[^\s#]*/g;
		const hashQidePattern = new RegExp(`${escapeForCharClass(chatVariableLeader)}qide:[^\\s]*`, 'g');

		const registerProvider = (
			debugName: string,
			triggerCharacters: string[],
			wordPattern: RegExp,
			build: (widget: IChatWidget, range: NonNullable<ReturnType<typeof computeCompletionRanges>>, token: CancellationToken) => Promise<CompletionList | undefined>,
		) => {
			this._register(languageFeaturesService.completionProvider.register({ scheme: Schemas.vscodeChatInput, hasAccessToAllModels: true }, {
				_debugDisplayName: `quantumide-${debugName}`,
				triggerCharacters,
				provideCompletionItems: async (model: ITextModel, position: Position, _context: CompletionContext, token: CancellationToken) => {
					const widget = this._chatWidgetService.getWidgetByInputUri(model.uri);
					if (!widget?.supportsFileReferences) {
						return;
					}
					const range = computeCompletionRanges(model, position, wordPattern, true);
					if (!range) {
						return;
					}
					return build(widget, range, token);
				},
			}));
		};

		registerProvider('at', ['@'], atPattern, async (widget, range, token) => {
			const result: CompletionList = { suggestions: [] };
			const query = (range.varWord?.word ?? '@').slice(1).toLowerCase();
			const activeUri = this._editorService.activeEditor?.resource ?? this._codeEditorService.getActiveCodeEditor()?.getModel()?.uri;
			if (activeUri && (!query || 'active'.startsWith(query) || basename(activeUri.fsPath).toLowerCase().includes(query))) {
				const bn = basename(activeUri.fsPath);
				const text = `${chatVariableLeader}file:${bn}`;
				result.suggestions.push(this._fileSuggestion(widget, range, text, activeUri, localize('quantumide.at.activeFile', 'Active file'), '0'));
			}
			const selection = this._codeEditorService.getActiveCodeEditor()?.getSelection();
			if (selection && !selection.isEmpty() && activeUri && (!query || 'selection'.startsWith(query))) {
				const text = `${chatVariableLeader}file:${basename(activeUri.fsPath)}:${selection.startLineNumber}-${selection.endLineNumber}`;
				result.suggestions.push({
					label: { label: '@selection', description: this._labelService.getUriLabel(activeUri, { relative: true }) },
					insertText: `${text} `,
					range,
					kind: CompletionItemKind.Reference,
					sortText: '0a',
					command: {
						id: 'quantumide.chat.insertAttachment',
						title: '',
						arguments: [{
							sessionResource: widget.viewModel?.sessionResource?.toString() ?? '',
							variable: {
								id: 'vscode.selection',
								range: { startLineNumber: range.replace.startLineNumber, startColumn: range.replace.startColumn, endLineNumber: range.replace.endLineNumber, endColumn: range.replace.startColumn + text.length },
								fullName: 'selection',
								isFile: true,
								data: { uri: activeUri, range: selection },
							},
						} satisfies IInsertAttachmentArgs],
					},
				});
			}
			if (!query || 'codebase'.startsWith(query)) {
				const codebaseText = `${chatVariableLeader}codebase `;
				result.suggestions.push({
					label: { label: '@codebase', description: localize('quantumide.at.codebase', 'Search the codebase (semantic + text)') },
					insertText: codebaseText,
					range,
					kind: CompletionItemKind.Keyword,
					sortText: '0b',
					command: {
						id: 'quantumide.chat.insertAttachment',
						title: '',
						arguments: [{
							sessionResource: widget.viewModel?.sessionResource?.toString() ?? '',
							variable: {
								id: 'quantumide.codebase',
								range: { startLineNumber: range.replace.startLineNumber, startColumn: range.replace.startColumn, endLineNumber: range.replace.endLineNumber, endColumn: range.replace.startColumn + codebaseText.length },
								fullName: 'codebase',
								isFile: false,
								data: { triggerSemanticSearch: true },
							},
						} satisfies IInsertAttachmentArgs],
					},
				});
			}
			const links = formatWorkspaceFolderLinks(this._workspace.getWorkspace().folders.map(f => ({ name: f.name, uri: f.uri })));
			const paths = await this._getWarmAtMentionPaths();
			const primary = this._workspace.getWorkspace().folders[0]?.uri;
			for (const m of quantumideFuzzyMatchFilePaths(query, paths, 20)) {
				if (token.isCancellationRequested) {
					break;
				}
				const uri = resolveWorkspaceGraphPath(m.path, links, primary);
				if (!uri) {
					continue;
				}
				result.suggestions.push(this._fileSuggestion(widget, range, `${chatVariableLeader}file:${basename(m.path)}`, uri, m.path, '2', m.path));
			}
			return result;
		});

		registerProvider('qide', [chatVariableLeader], hashQidePattern, async (widget, range, token) => {
			const result: CompletionList = { suggestions: [] };
			const raw = range.varWord?.word ?? '';
			const query = raw.replace(new RegExp(`^${escapeForCharClass(chatVariableLeader)}qide:`), '').toLowerCase();
			const links = formatWorkspaceFolderLinks(this._workspace.getWorkspace().folders.map(f => ({ name: f.name, uri: f.uri })));
			const qPaths = await this._getWarmAtMentionPaths();
			const primary = this._workspace.getWorkspace().folders[0]?.uri;
			for (const m of quantumideFuzzyMatchFilePaths(query, qPaths, 15)) {
				const path = m.path;
				if (token.isCancellationRequested) {
					break;
				}
				const uri = resolveWorkspaceGraphPath(path, links, primary);
				if (!uri) {
					continue;
				}
				const text = `${chatVariableLeader}qide:${path}`;
				result.suggestions.push(this._fileSuggestion(widget, range, text, uri, path, '1', path));
			}
			return result;
		});
	}

	private async _getWarmAtMentionPaths(): Promise<readonly string[]> {
		const graph = this._ctx.getWorkspaceGraph();
		const syncPaths = this._ctx.getCachedAtMentionPaths();
		const cacheKey = syncPaths.length > 0
			? `sync:${graph?.status.generatedAt ?? 'none'}:${syncPaths.length}`
			: `${graph?.status.generatedAt ?? 'none'}:${graph?.files.length ?? 0}`;
		if (this._warmPathsCacheKey === cacheKey && this._warmPathsCache) {
			return this._warmPathsCache;
		}
		if (syncPaths.length > 0) {
			this._warmPathsCacheKey = cacheKey;
			this._warmPathsCache = syncPaths;
			void this._refreshAtMentionPathsWithIgnorePolicy();
			return syncPaths;
		}
		const policy = await this._ignore.getPolicy();
		const paths: string[] = [];
		for (const file of graph?.files ?? []) {
			if (!isQuantumIDEPathIgnored(file.workspaceRelativePath, policy, 'ai', file.name)) {
				paths.push(file.workspaceRelativePath);
			}
		}
		this._warmPathsCacheKey = cacheKey;
		this._warmPathsCache = paths;
		return paths;
	}

	/** Refine @ paths after async ignore files load; does not block cold-open completions. */
	private async _refreshAtMentionPathsWithIgnorePolicy(): Promise<void> {
		const policy = await this._ignore.getPolicy();
		this._ctx.rebuildCachedAtMentionPaths(policy);
		const refined = this._ctx.getCachedAtMentionPaths();
		const graph = this._ctx.getWorkspaceGraph();
		this._warmPathsCacheKey = `sync:${graph?.status.generatedAt ?? 'none'}:${refined.length}`;
		this._warmPathsCache = refined;
	}

	private _fileSuggestion(
		widget: IChatWidget,
		range: NonNullable<ReturnType<typeof computeCompletionRanges>>,
		text: string,
		uri: URI,
		description: string,
		sort: string,
		workspaceRelativePath?: string,
	) {
		const meta = workspaceRelativePath ? { workspaceRelativePath } : undefined;
		return {
			label: { label: text, description },
			insertText: `${text} `,
			range,
			kind: CompletionItemKind.File,
			sortText: sort,
			insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
			command: {
				id: 'quantumide.chat.insertAttachment',
				title: '',
				arguments: [{
					sessionResource: widget.viewModel?.sessionResource?.toString() ?? '',
					variable: {
						id: uri.toString(),
						range: { startLineNumber: range.replace.startLineNumber, startColumn: range.replace.startColumn, endLineNumber: range.replace.endLineNumber, endColumn: range.replace.startColumn + text.length },
						fullName: basename(uri.fsPath),
						isFile: true,
						data: uri,
						_meta: meta,
					},
				} satisfies IInsertAttachmentArgs],
			},
		};
	}
}

registerWorkbenchContribution2(QuantumIDEChatAtMentionContribution.ID, QuantumIDEChatAtMentionContribution, WorkbenchPhase.AfterRestored);
