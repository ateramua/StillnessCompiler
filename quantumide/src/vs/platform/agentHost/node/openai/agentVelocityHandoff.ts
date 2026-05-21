/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import type { IFileService } from '../../../files/common/files.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { QUANTUMIDE_AGENT_HANDOFF_FILE, QUANTUMIDE_AGENT_TASKS_FILE } from '../../../quantumide/common/agentVelocity.js';

const MAX_HANDOFF_CHARS = 6_000;

export interface IAgentVelocityHandoffInput {
	readonly turnId: string;
	readonly userPrompt: string;
	readonly assistantSummary: string;
	readonly toolIterations: number;
	readonly activitySteps: number;
}

export async function persistAgentVelocityHandoff(
	fileService: IFileService,
	workingDirectory: URI | undefined,
	input: IAgentVelocityHandoffInput,
): Promise<void> {
	if (!workingDirectory) {
		return;
	}
	const handoffDir = joinPath(workingDirectory, '.quantumide');
	const handoffFile = joinPath(workingDirectory, QUANTUMIDE_AGENT_HANDOFF_FILE);
	try {
		await fileService.createFolder(handoffDir);
	} catch {
		// exists
	}
	const body = [
		'# QuantumIDE agent handoff',
		'',
		`- Turn: ${input.turnId}`,
		`- Tool iterations: ${input.toolIterations}`,
		`- Activity steps: ${input.activitySteps}`,
		'',
		'## Last user request',
		input.userPrompt.slice(0, 1200),
		'',
		'## Assistant state',
		input.assistantSummary.slice(0, MAX_HANDOFF_CHARS),
		'',
		'Resume with command **QuantumIDE: Resume Agent Handoff** or continue the task in chat.',
	].join('\n');
	await fileService.writeFile(handoffFile, VSBuffer.fromString(body));
}

/** Extracts open markdown checklist items (`- [ ] …`) from assistant text. */
export function extractAgentVelocityTasksFromAssistant(text: string): string[] {
	const tasks: string[] = [];
	for (const line of text.split(/\r?\n/)) {
		const match = line.match(/^\s*[-*]\s*\[\s*\]\s+(.+)$/);
		if (!match) {
			continue;
		}
		const task = match[1].trim();
		if (task && !tasks.includes(task)) {
			tasks.push(task);
		}
	}
	return tasks;
}

export async function loadAgentVelocityTasks(
	fileService: IFileService,
	workingDirectory: URI | undefined,
): Promise<string[]> {
	if (!workingDirectory) {
		return [];
	}
	const tasksFile = joinPath(workingDirectory, QUANTUMIDE_AGENT_TASKS_FILE);
	try {
		const raw = (await fileService.readFile(tasksFile)).value.toString();
		const parsed = JSON.parse(raw) as { tasks?: unknown };
		return Array.isArray(parsed.tasks) ? parsed.tasks.filter((t): t is string => typeof t === 'string' && t.trim().length > 0) : [];
	} catch {
		return [];
	}
}

export async function mergeAndPersistAgentVelocityTasks(
	fileService: IFileService,
	workingDirectory: URI | undefined,
	assistantText: string,
	existingTasks: readonly string[] = [],
): Promise<string[]> {
	const extracted = extractAgentVelocityTasksFromAssistant(assistantText);
	const fileTasks = await loadAgentVelocityTasks(fileService, workingDirectory);
	const baseline = extracted.length > 0 ? extracted : (existingTasks.length > 0 ? [...existingTasks] : fileTasks);
	if (baseline.length === 0) {
		return [];
	}
	await persistAgentVelocityTasks(fileService, workingDirectory, baseline);
	return baseline;
}

export async function persistAgentVelocityTasks(
	fileService: IFileService,
	workingDirectory: URI | undefined,
	tasks: readonly string[],
): Promise<void> {
	if (!workingDirectory || tasks.length === 0) {
		return;
	}
	const tasksFile = joinPath(workingDirectory, QUANTUMIDE_AGENT_TASKS_FILE);
	const handoffDir = joinPath(workingDirectory, '.quantumide');
	try {
		await fileService.createFolder(handoffDir);
	} catch {
		// exists
	}
	await fileService.writeFile(tasksFile, VSBuffer.fromString(JSON.stringify({ tasks, updatedAt: Date.now() }, null, 2)));
}
