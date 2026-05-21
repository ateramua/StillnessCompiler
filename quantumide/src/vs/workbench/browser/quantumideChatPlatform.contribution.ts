/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../nls.js';
import { EditorContextKeys } from '../../editor/common/editorContextKeys.js';
import { Action2, registerAction2 } from '../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../platform/instantiation/common/instantiation.js';
import { QuantumIDEAICommandId, QuantumIDEAISettingId } from '../../platform/quantumide/common/quantumideAISettings.js';
import { IQuantumIDEWorkspaceContextService } from '../services/quantumide/common/quantumideWorkspaceContext.js';
import { IQuantumIDESemanticIndexService } from '../services/quantumide/common/quantumideSemanticIndex.js';
import { IQuantumIDEInlineEditorService } from '../services/quantumide/browser/quantumideInlineEditorService.js';

const INLINE_PROMPTS: Record<string, string> = {
	[QuantumIDEAICommandId.InlineExplain]: 'Explain the selected code clearly and concisely.',
	[QuantumIDEAICommandId.InlineOptimize]: 'Optimize the selected code for readability and performance.',
	[QuantumIDEAICommandId.InlineRewrite]: 'Rewrite the selected code while preserving behavior.',
	[QuantumIDEAICommandId.InlineGenerateTests]: 'Generate focused unit tests for the selected code.',
	[QuantumIDEAICommandId.InlineAddDocs]: 'Add concise documentation comments for the selected code.',
	[QuantumIDEAICommandId.InlineRefactor]: 'Refactor the selected code for clarity and maintainability.',
	[QuantumIDEAICommandId.InlineConvertSyntax]: 'Convert the selected code syntax (e.g. callbacks to async/await).',
	[QuantumIDEAICommandId.InlineMigrateFramework]: 'Migrate the selected code to the idiomatic pattern of the target framework.',
};

const CODE_ONLY_INLINE_COMMANDS = new Set<string>([
	QuantumIDEAICommandId.InlineOptimize,
	QuantumIDEAICommandId.InlineRewrite,
	QuantumIDEAICommandId.InlineRefactor,
	QuantumIDEAICommandId.InlineConvertSyntax,
	QuantumIDEAICommandId.InlineMigrateFramework,
]);

class QuantumIDEInlineEditorAction extends Action2 {
	constructor(private readonly commandId: string, title: string) {
		super({
			id: commandId,
			title: { value: title, original: title },
			category: { value: localize('quantumide.ai.category', 'QuantumIDE AI'), original: 'QuantumIDE AI' },
			precondition: ContextKeyExpr.and(
				EditorContextKeys.hasNonEmptySelection,
				ContextKeyExpr.equals(`config.${QuantumIDEAISettingId.ChatInlineEnabled}`, true),
			),
			f1: true,
		});
	}

	override run(accessor: ServicesAccessor): void {
		const prompt = INLINE_PROMPTS[this.commandId];
		accessor.get(IQuantumIDEInlineEditorService).runInlinePrompt(prompt, { codeOnly: CODE_ONLY_INLINE_COMMANDS.has(this.commandId) });
	}
}

registerAction2(class extends QuantumIDEInlineEditorAction {
	constructor() { super(QuantumIDEAICommandId.InlineExplain, 'Explain Selection with QuantumIDE AI'); }
});

registerAction2(class extends QuantumIDEInlineEditorAction {
	constructor() { super(QuantumIDEAICommandId.InlineOptimize, 'Optimize Selection with QuantumIDE AI'); }
});

registerAction2(class extends QuantumIDEInlineEditorAction {
	constructor() { super(QuantumIDEAICommandId.InlineRewrite, 'Rewrite Selection with QuantumIDE AI'); }
});

registerAction2(class extends QuantumIDEInlineEditorAction {
	constructor() { super(QuantumIDEAICommandId.InlineGenerateTests, 'Generate Tests for Selection'); }
});

registerAction2(class extends QuantumIDEInlineEditorAction {
	constructor() { super(QuantumIDEAICommandId.InlineAddDocs, 'Add Docs for Selection'); }
});

registerAction2(class extends QuantumIDEInlineEditorAction {
	constructor() { super(QuantumIDEAICommandId.InlineRefactor, 'Refactor Selection with QuantumIDE AI'); }
});

registerAction2(class extends QuantumIDEInlineEditorAction {
	constructor() { super(QuantumIDEAICommandId.InlineConvertSyntax, 'Convert Syntax for Selection'); }
});

registerAction2(class extends QuantumIDEInlineEditorAction {
	constructor() { super(QuantumIDEAICommandId.InlineMigrateFramework, 'Migrate Framework for Selection'); }
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: QuantumIDEAICommandId.ReindexWorkspace,
			title: localize2('quantumide.reindexWorkspace', 'Reindex Workspace for QuantumIDE AI'),
			category: { value: localize('quantumide.ai.category', 'QuantumIDE AI'), original: 'QuantumIDE AI' },
			f1: true,
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const contextService = accessor.get(IQuantumIDEWorkspaceContextService);
		const semanticService = accessor.get(IQuantumIDESemanticIndexService);
		await contextService.refreshWorkspaceGraph('manual reindex');
		await semanticService.refreshIndexes('manual reindex');
	}
});
