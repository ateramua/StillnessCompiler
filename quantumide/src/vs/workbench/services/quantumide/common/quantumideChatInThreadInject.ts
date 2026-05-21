/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export interface IQuantumIDEChatInThreadInjectService {
	readonly _serviceBrand: undefined;
	injectEditReviewIntoActiveChat(batchLabel: string): void;
	injectWorkspaceEditCards(batchLabel: string): void;
	injectTerminalBlock(command: string, exitCode: number, output: string): void;
	injectTestResults(summary: string, passed: number, failed: number, detail: string): void;
	injectExecutionGraphChecklist(checklist: string): void;
	injectToolConfirmation(title: string, message: string, approveCommand: string, denyCommand?: string): void;
	injectCodeBlockRun(language: string, code: string): void;
	injectInlineSuggestionBar(resourceLabel: string, hunkCount: number): void;
	injectBatchReviewSummary(batchCount: number, fileCount: number, paths: readonly string[]): void;
	injectRichCodePreview(language: string, code: string, title: string): void;
	injectMergeConflictUi(path: string, conflictCount: number): void;
	injectLiveRefactorPreview(path: string, hunkCount: number): void;
	injectCollabLiveStatus(participantCount: number, activeEditors: readonly string[]): void;
}

export const IQuantumIDEChatInThreadInjectService = createDecorator<IQuantumIDEChatInThreadInjectService>('quantumIDEChatInThreadInjectService');
