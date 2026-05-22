/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import type { IFileService } from '../../../../platform/files/common/files.js';
import { MessageAttachmentKind, type MessageAttachment } from '../../../../platform/agentHost/common/state/sessionState.js';
import { buildQuantumIDEChatRulesContextBundle } from '../../../../platform/quantumide/common/quantumideChatRulesContext.js';
import {
	QUANTUMIDE_AGENT_HANDOFF_FILE,
	QUANTUMIDE_AGENT_TASKS_FILE,
	QUANTUMIDE_PINNED_TASK_SPEC_STORAGE_KEY,
} from '../../../../platform/quantumide/common/agentVelocity.js';
import type { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';

const MAX_RULES_CHARS = 12_000;
const MAX_PINNED_SPEC_CHARS = 16_000;
const MAX_HANDOFF_CHARS = 4_000;

export async function buildQuantumIDEAgentRulesAttachments(
	fileService: IFileService,
	workspaceFolder: URI | undefined,
	activeRelativePaths: readonly string[] = [],
): Promise<MessageAttachment[]> {
	if (!workspaceFolder) {
		return [];
	}
	const attachments: MessageAttachment[] = [];
	const { agentsMdContent, rulesPromptText } = await buildQuantumIDEChatRulesContextBundle(
		fileService,
		workspaceFolder,
		activeRelativePaths,
		MAX_RULES_CHARS,
	);
	if (agentsMdContent) {
		attachments.push({
			type: MessageAttachmentKind.Simple,
			label: 'AGENTS.md',
			modelRepresentation: agentsMdContent,
			_meta: { source: 'quantumide-agent-velocity', kind: 'agents-md' },
		});
	}
	if (rulesPromptText) {
		attachments.push({
			type: MessageAttachmentKind.Simple,
			label: 'QuantumIDE workspace rules (Always / Auto / Manual)',
			modelRepresentation: rulesPromptText,
			_meta: { source: 'quantumide-agent-velocity', kind: 'rules' },
		});
	}
	return attachments;
}

export async function buildPinnedTaskSpecAttachment(
	fileService: IFileService,
	storageService: IStorageService,
	workspaceFolder: URI | undefined,
	scope: StorageScope,
): Promise<MessageAttachment | undefined> {
	if (!workspaceFolder) {
		return undefined;
	}
	const pinnedUri = storageService.get(QUANTUMIDE_PINNED_TASK_SPEC_STORAGE_KEY, scope);
	if (!pinnedUri) {
		return undefined;
	}
	try {
		const resource = URI.parse(pinnedUri);
		const content = (await fileService.readFile(resource)).value.toString();
		const clipped = content.slice(0, MAX_PINNED_SPEC_CHARS);
		return {
			type: MessageAttachmentKind.Simple,
			label: 'Pinned task spec',
			modelRepresentation: `Follow this pinned task specification from ${resource.fsPath}:\n\n${clipped}`,
			_meta: { source: 'quantumide-agent-velocity', kind: 'pinned-task-spec', uri: resource.toString() },
		};
	} catch {
		return undefined;
	}
}

export function setPinnedTaskSpecUri(
	storageService: IStorageService,
	scope: StorageScope,
	uri: URI | undefined,
	target: StorageTarget,
): void {
	if (!uri) {
		storageService.remove(QUANTUMIDE_PINNED_TASK_SPEC_STORAGE_KEY, scope);
		return;
	}
	storageService.store(QUANTUMIDE_PINNED_TASK_SPEC_STORAGE_KEY, uri.toString(), scope, target);
}

export async function readAgentHandoffText(
	fileService: IFileService,
	workspaceFolder: URI | undefined,
): Promise<string | undefined> {
	if (!workspaceFolder) {
		return undefined;
	}
	const handoffFile = joinPath(workspaceFolder, QUANTUMIDE_AGENT_HANDOFF_FILE);
	try {
		const content = (await fileService.readFile(handoffFile)).value.toString().trim();
		return content ? content.slice(0, MAX_HANDOFF_CHARS) : undefined;
	} catch {
		return undefined;
	}
}

export async function buildAgentHandoffResumeAttachment(
	fileService: IFileService,
	workspaceFolder: URI | undefined,
): Promise<MessageAttachment | undefined> {
	const content = await readAgentHandoffText(fileService, workspaceFolder);
	if (!content) {
		return undefined;
	}
	return {
		type: MessageAttachmentKind.Simple,
		label: 'Agent handoff (resume)',
		modelRepresentation: content,
		_meta: { source: 'quantumide-agent-velocity', kind: 'handoff-resume' },
	};
}

export async function buildAgentTasksAttachment(
	fileService: IFileService,
	workspaceFolder: URI | undefined,
): Promise<MessageAttachment | undefined> {
	if (!workspaceFolder) {
		return undefined;
	}
	const tasksFile = joinPath(workspaceFolder, QUANTUMIDE_AGENT_TASKS_FILE);
	try {
		const raw = (await fileService.readFile(tasksFile)).value.toString();
		const parsed = JSON.parse(raw) as { tasks?: unknown };
		const tasks = Array.isArray(parsed.tasks) ? parsed.tasks.filter(t => typeof t === 'string') : [];
		if (!tasks.length) {
			return undefined;
		}
		const lines = tasks.map((t, i) => `${i + 1}. ${t}`);
		return {
			type: MessageAttachmentKind.Simple,
			label: 'Agent task checklist',
			modelRepresentation: `Outstanding tasks:\n${lines.join('\n')}`,
			_meta: { source: 'quantumide-agent-velocity', kind: 'task-checklist' },
		};
	} catch {
		return undefined;
	}
}
