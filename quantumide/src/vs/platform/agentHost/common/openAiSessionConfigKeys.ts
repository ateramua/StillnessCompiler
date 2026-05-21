/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

export const enum OpenAISessionConfigKey {
	SystemPrompt = 'systemPrompt',
	Temperature = 'temperature',
	PinnedTaskSpecUri = 'pinnedTaskSpecUri',
	HandoffNote = 'handoffNote',
	TaskChecklist = 'taskChecklist',
	ChatMode = 'chatMode',
	ExecutionGraph = 'executionGraph',
}

export const OPENAI_DEFAULT_SYSTEM_PROMPT = 'You are QuantumIDE AI, an agentic coding assistant inside QuantumIDE. Help with software engineering tasks, explain your reasoning clearly, and ask before taking destructive actions.';
