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
import type { IDynamicVariable } from '../contrib/chat/common/attachments/chatVariables.js';
import { IQuantumIDEWorkspaceContextService } from '../services/quantumide/common/quantumideWorkspaceContext.js';

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

	constructor(
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
		@IWorkspaceContextService private readonly _workspace: IWorkspaceContextService,
		@IQuantumIDEWorkspaceContextService private readonly _ctx: IQuantumIDEWorkspaceContextService,
		@ILabelService private readonly _labelService: ILabelService,
		@ICodeEditorService private readonly _codeEditorService: ICodeEditorService,
		@IEditorService private readonly _editorService: IEditorService,
		@IConfigurationService private readonly _configuration: IConfigurationService,
	) {
		super();
		if (!isQuantumIDE() || this._configuration.getValue<boolean>(QuantumIDEAISettingId.ChatAttachmentsEnabled) === false) {
			return;
		}

		this._register(CommandsRegistry.registerCommand('quantumide.chat.insertAttachment', (_accessor: ServicesAccessor, args: IInsertAttachmentArgs) => {
			const widget = this._chatWidgetService.getWidgetBySessionResource(URI.parse(args.sessionResource));
			widget?.getContrib<ChatDynamicVariableModel>(ChatDynamicVariableModel.ID)?.addReference(args.variable);
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
			const paths = this._ctx.getWorkspaceGraph()?.files.map(f => f.workspaceRelativePath) ?? [];
			for (const m of quantumideFuzzyMatchFilePaths(query, paths, 20)) {
				if (token.isCancellationRequested) {
					break;
				}
				const folder = this._workspace.getWorkspace().folders[0];
				if (!folder) {
					continue;
				}
				result.suggestions.push(this._fileSuggestion(widget, range, `${chatVariableLeader}file:${basename(m.path)}`, URI.joinPath(folder.uri, m.path), m.path, '2'));
			}
			return result;
		});

		registerProvider('qide', [chatVariableLeader], hashQidePattern, async (widget, range, token) => {
			const result: CompletionList = { suggestions: [] };
			const raw = range.varWord?.word ?? '';
			const query = raw.replace(new RegExp(`^${escapeForCharClass(chatVariableLeader)}qide:`), '').toLowerCase();
			const folder = this._workspace.getWorkspace().folders[0];
			if (!folder) {
				return result;
			}
			const qPaths = this._ctx.getWorkspaceGraph()?.files.map(f => f.workspaceRelativePath) ?? [];
			for (const m of quantumideFuzzyMatchFilePaths(query, qPaths, 15)) {
				const path = m.path;
				if (token.isCancellationRequested) {
					break;
				}
				const text = `${chatVariableLeader}qide:${path}`;
				result.suggestions.push(this._fileSuggestion(widget, range, text, URI.joinPath(folder.uri, path), path, '1'));
			}
			return result;
		});
	}

	private _fileSuggestion(
		widget: IChatWidget,
		range: NonNullable<ReturnType<typeof computeCompletionRanges>>,
		text: string,
		uri: URI,
		description: string,
		sort: string,
	) {
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
					},
				} satisfies IInsertAttachmentArgs],
			},
		};
	}
}

registerWorkbenchContribution2(QuantumIDEChatAtMentionContribution.ID, QuantumIDEChatAtMentionContribution, WorkbenchPhase.AfterRestored);
