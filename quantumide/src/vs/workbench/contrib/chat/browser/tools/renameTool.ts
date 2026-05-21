/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ResourceMap, ResourceSet } from '../../../../../base/common/map.js';
import { relativePath } from '../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { IBulkEditService, ResourceTextEdit } from '../../../../../editor/browser/services/bulkEditService.js';
import { TextEdit as TextEditOperation, TextReplacement } from '../../../../../editor/common/core/edits/textEdit.js';
import { Position } from '../../../../../editor/common/core/position.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { TextEdit } from '../../../../../editor/common/languages.js';
import { ILanguageFeaturesService } from '../../../../../editor/common/services/languageFeatures.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { rename } from '../../../../../editor/contrib/rename/browser/rename.js';
import { localize } from '../../../../../nls.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { IQuantumIDEChatEditSessionService } from '../../../../services/quantumide/browser/quantumideChatEditSessionService.js';
import { IQuantumIDEDiffReviewService } from '../../../../services/quantumide/browser/quantumideDiffReviewService.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { ChatModel } from '../../common/model/chatModel.js';
import { CountTokensCallback, ILanguageModelToolsService, IPreparedToolInvocation, IToolData, IToolImpl, IToolInvocation, IToolInvocationPreparationContext, IToolResult, ToolDataSource, ToolProgress } from '../../common/tools/languageModelToolsService.js';
import { createToolSimpleTextResult } from '../../common/tools/builtinTools/toolHelpers.js';
import { errorResult, findLineNumber, findSymbolColumn, ISymbolToolInput, resolveToolUri } from './toolHelpers.js';

export const RenameToolId = 'vscode_renameSymbol';

interface IRenameToolInput extends ISymbolToolInput {
	newName: string;
	previewOnly?: boolean;
}

interface IStagedRenameEdit {
	path: string;
	content: string;
	resourceUri: string;
}

const BaseModelDescription = `Rename a code symbol across the workspace using the language server's rename functionality. This performs a precise, semantics-aware rename that updates all references.

Input:
- "symbol": The exact current name of the symbol to rename.
- "newName": The new name for the symbol.
- "uri": A full URI (e.g. "file:///path/to/file.ts") of a file where the symbol appears. Provide either "uri" or "filePath".
- "filePath": A workspace-relative file path (e.g. "src/utils/helpers.ts") of a file where the symbol appears. Provide either "uri" or "filePath".
- "lineContent": A substring of the line of code where the symbol appears. This is used to locate the exact position in the file. Must be the actual text from the file - do NOT fabricate it.
- "previewOnly": Optional boolean. Defaults to true and stages a reviewable pending batch instead of applying immediately.

IMPORTANT: The file and line do NOT need to be the definition of the symbol. Any occurrence works - a usage, an import, a call site, etc. You can pick whichever occurrence is most convenient.

If the tool returns an error, retry with corrected input - ensure the file path is correct, the line content matches the actual file content, and the symbol name appears in that line.`;

const StaticModelDescription = BaseModelDescription + `

If the file's language has no rename provider registered, the tool returns an error.`;

export class RenameTool extends Disposable implements IToolImpl {

	constructor(
		@ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService,
		@ITextModelService private readonly _textModelService: ITextModelService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IChatService private readonly _chatService: IChatService,
		@IBulkEditService private readonly _bulkEditService: IBulkEditService,
		@IQuantumIDEChatEditSessionService private readonly _chatEditSessionService: IQuantumIDEChatEditSessionService,
		@IQuantumIDEDiffReviewService private readonly _diffReviewService: IQuantumIDEDiffReviewService,
	) {
		super();
	}

	getToolData(): IToolData {
		return this._buildToolData(
			StaticModelDescription,
			localize('tool.rename.userDescription', 'Rename a symbol across the workspace'),
		);
	}

	private _buildToolData(modelDescription: string, userDescription: string): IToolData {
		return {
			id: RenameToolId,
			toolReferenceName: 'rename',
			canBeReferencedInPrompt: false,
			icon: ThemeIcon.fromId(Codicon.rename.id),
			displayName: localize('tool.rename.displayName', 'Rename Symbol'),
			userDescription,
			modelDescription,
			source: ToolDataSource.Internal,
			when: ContextKeyExpr.has('config.chat.tools.renameTool.enabled'),
			inputSchema: {
				type: 'object',
				properties: {
					symbol: {
						type: 'string',
						description: 'The exact current name of the symbol to rename.'
					},
					newName: {
						type: 'string',
						description: 'The new name for the symbol.'
					},
					uri: {
						type: 'string',
						description: 'A full URI of a file where the symbol appears (e.g. "file:///path/to/file.ts"). Provide either "uri" or "filePath".'
					},
					filePath: {
						type: 'string',
						description: 'A workspace-relative file path where the symbol appears (e.g. "src/utils/helpers.ts"). Provide either "uri" or "filePath".'
					},
					lineContent: {
						type: 'string',
						description: 'A substring of the line of code where the symbol appears. Used to locate the exact position. Must be actual text from the file.'
					},
					previewOnly: {
						type: 'boolean',
						description: 'When true (default), stage rename edits for review before applying. Set false to apply immediately.'
					}
				},
				required: ['symbol', 'newName', 'lineContent']
			}
		};
	}

	async prepareToolInvocation(context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const input = context.parameters as IRenameToolInput;
		return {
			invocationMessage: localize('tool.rename.invocationMessage', 'Renaming `{0}` to `{1}`', input.symbol, input.newName),
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, token: CancellationToken): Promise<IToolResult> {
		const input = invocation.parameters as IRenameToolInput;

		const uri = resolveToolUri(input, this._workspaceContextService, invocation.context?.workingDirectory);
		if (!uri) {
			return errorResult('Provide either "uri" (a full URI) or "filePath" (a workspace-relative path) to identify the file.');
		}

		const ref = await this._textModelService.createModelReference(uri);
		try {
			const model = ref.object.textEditorModel;

			if (!this._languageFeaturesService.renameProvider.has(model)) {
				return errorResult(`No rename provider available for this file's language. The rename tool may not support this language.`);
			}

			const lineNumber = findLineNumber(model, input.lineContent);
			if (lineNumber === undefined) {
				return errorResult(`Could not find line content "${input.lineContent}" in ${uri.toString()}. Provide the exact text from the line where the symbol appears.`);
			}

			const lineText = model.getLineContent(lineNumber);
			const column = findSymbolColumn(lineText, input.symbol);
			if (column === undefined) {
				return errorResult(`Could not find symbol "${input.symbol}" in the matched line. Ensure the symbol name is correct and appears in the provided line content.`);
			}

			const position = new Position(lineNumber, column);
			const renameResult = await rename(this._languageFeaturesService.renameProvider, model, position, input.newName);

			if (renameResult.rejectReason) {
				return errorResult(`Rename rejected: ${renameResult.rejectReason}`);
			}
			if (renameResult.edits.length === 0) {
				return errorResult(`Rename produced no edits.`);
			}

			const previewOnly = input.previewOnly !== false;
			if (previewOnly) {
				const stagedEdits = await this._stageRenamePreview(renameResult.edits);
				if (stagedEdits.length > 0) {
					const workspaceRoot = this._workspaceContextService.getWorkspace().folders[0]?.uri;
					await this._chatEditSessionService.stageFromProposedEdits(stagedEdits, localize('tool.rename.stageLabel', 'Rename symbol edits'));
					await this._diffReviewService.openProposedFileEdits(
						localize('tool.rename.previewTitle', 'Rename Preview: {0} → {1}', input.symbol, input.newName),
						stagedEdits,
						workspaceRoot,
					);
					return this._previewResult(input, stagedEdits.length, renameResult.edits.length);
				}
			}

			if (invocation.context) {
				const chatModel = this._chatService.getSession(invocation.context.sessionResource) as ChatModel | undefined;
				const request = chatModel?.getRequests().at(-1);
				if (chatModel && request) {
					const editsByUri = new ResourceMap<TextEdit[]>();
					for (const edit of renameResult.edits) {
						if (ResourceTextEdit.is(edit)) {
							let edits = editsByUri.get(edit.resource);
							if (!edits) {
								edits = [];
								editsByUri.set(edit.resource, edits);
							}
							edits.push(edit.textEdit);
						}
					}
					for (const [editUri, edits] of editsByUri) {
						chatModel.acceptResponseProgress(request, { kind: 'textEdit', uri: editUri, edits: [] });
						chatModel.acceptResponseProgress(request, { kind: 'textEdit', uri: editUri, edits });
						chatModel.acceptResponseProgress(request, { kind: 'textEdit', uri: editUri, edits: [], done: true });
					}
					return this._successResult(input, editsByUri.size, renameResult.edits.length);
				}
			}

			await this._bulkEditService.apply(renameResult);
			const fileCount = new ResourceSet(renameResult.edits.filter(ResourceTextEdit.is).map(e => e.resource)).size;
			return this._successResult(input, fileCount, renameResult.edits.length);

		} finally {
			ref.dispose();
		}
	}

	private _successResult(input: IRenameToolInput, fileCount: number, editCount: number): IToolResult {
		const text = editCount === 1
			? localize('tool.rename.oneEdit', "Renamed `{0}` to `{1}` - 1 edit in {2} file.", input.symbol, input.newName, fileCount)
			: localize('tool.rename.edits', "Renamed `{0}` to `{1}` - {2} edits across {3} files.", input.symbol, input.newName, editCount, fileCount);
		const result = createToolSimpleTextResult(text);
		result.toolResultMessage = new MarkdownString(text);
		return result;
	}

	private _previewResult(input: IRenameToolInput, fileCount: number, editCount: number): IToolResult {
		const text = localize(
			'tool.rename.preview',
			'Prepared rename `{0}` → `{1}` with {2} edits across {3} files. Review and accept/reject each pending file change from Inline Suggestions & Batch Edits.',
			input.symbol,
			input.newName,
			editCount,
			fileCount,
		);
		const result = createToolSimpleTextResult(text);
		result.toolResultMessage = new MarkdownString(text);
		return result;
	}

	private async _stageRenamePreview(edits: readonly unknown[]): Promise<readonly IStagedRenameEdit[]> {
		const editsByUri = new ResourceMap<TextEdit[]>();
		for (const edit of edits) {
			if (!ResourceTextEdit.is(edit)) {
				continue;
			}
			let uriEdits = editsByUri.get(edit.resource);
			if (!uriEdits) {
				uriEdits = [];
				editsByUri.set(edit.resource, uriEdits);
			}
			uriEdits.push(edit.textEdit);
		}

		const staged: IStagedRenameEdit[] = [];
		for (const [editUri, uriEdits] of editsByUri) {
			const relPath = this._workspaceRelativePath(editUri);
			if (!relPath) {
				continue;
			}
			const ref = await this._textModelService.createModelReference(editUri);
			try {
				const model = ref.object.textEditorModel;
				const replacements = uriEdits.map(edit => new TextReplacement(Range.lift(edit.range), edit.text));
				const content = TextEditOperation.fromParallelReplacementsUnsorted(replacements).applyToString(model.getValue());
				staged.push({ path: relPath, content, resourceUri: editUri.toString() });
			} finally {
				ref.dispose();
			}
		}
		return staged;
	}

	private _workspaceRelativePath(resource: URI): string | undefined {
		const folder = this._workspaceContextService.getWorkspaceFolder(resource);
		if (!folder) {
			return undefined;
		}
		return relativePath(folder.uri, resource) ?? undefined;
	}
}

export class RenameToolContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'chat.renameTool';

	constructor(
		@ILanguageModelToolsService toolsService: ILanguageModelToolsService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		const renameTool = this._store.add(instantiationService.createInstance(RenameTool));
		this._store.add(toolsService.registerTool(renameTool.getToolData(), renameTool));
	}
}
