/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../base/common/observable.js';
import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { INativeEnvironmentService } from '../../../environment/common/environment.js';
import { IFileService } from '../../../files/common/files.js';
import { ILogService } from '../../../log/common/log.js';
import { QuantumIDEAIProvider, QuantumIDEAISettingId, QuantumIDEAgentActivityEnvVar, QuantumIDEOpenAIBaseUrlEnvVar, QuantumIDEOpenAIApiKeyEnvVar, QuantumIDEOpenAIProtectedResourceId, QuantumIDEOpenAIProviderId, QuantumIDEOpenAIStreamEnvVar } from '../../../quantumide/common/quantumideAISettings.js';
import { defaultQuantumIDEModelRoutes, enabledQuantumIDEModelRoutes, IQuantumIDEModelRoute, QuantumIDEModelRouterConfigKey } from '../../../quantumide/common/quantumideModelRouter.js';
import { IAgentPluginManager, type ISyncedCustomization } from '../../common/agentPluginManager.js';
import { createSchema, schemaProperty } from '../../common/agentHostSchema.js';
import { OPENAI_DEFAULT_SYSTEM_PROMPT, OpenAISessionConfigKey } from '../../common/openAiSessionConfigKeys.js';
import { AgentSession, AgentSignal, IAgent, IAgentCreateSessionConfig, IAgentCreateSessionResult, IAgentDescriptor, IAgentModelInfo, IAgentResolveSessionConfigParams, IAgentSessionConfigCompletionsParams, IAgentSessionMetadata, IAgentSessionProjectInfo } from '../../common/agentService.js';
import { ISessionDataService } from '../../common/sessionDataService.js';
import type { ResolveSessionConfigResult, SessionConfigCompletionsResult } from '../../common/state/protocol/commands.js';
import type { ProtectedResourceMetadata } from '../../common/state/protocol/state.js';
import { ActionType } from '../../common/state/sessionActions.js';
import type { SessionActivityChangedAction } from '../../common/state/protocol/actions.js';
import { CustomizationStatus, MessageAttachmentKind, ResponsePartKind, SessionInputResponseKind, SessionStatus, ToolCallConfirmationReason, ToolCallStatus, ToolResultContentType, TurnState, type CustomizationRef, type MessageAttachment, type ModelSelection, type PendingMessage, type SessionCustomization, type SessionInputAnswer, type ToolCallResult, type ToolDefinition, type Turn } from '../../common/state/sessionState.js';
import { parsePlugin, type IParsedPlugin, type INamedPluginResource } from '../../../agentPlugins/common/pluginParsers.js';
import { IAgentConfigurationService } from '../agentConfigurationService.js';
import { OpenAIChatStreamChunkKind, OpenAIClient, OpenAIStreamNotSupportedError, type IOpenAIChatRequest, type IOpenAIChatResponse, type IOpenAIMessage, type IOpenAIToolCall, type IOpenAIToolDefinition } from './openAiClient.js';
import { getAgentStatusActivityLabel } from '../../../quantumide/common/agentActivityLabels.js';
import { getOpenAIActivityLabel, type OpenAIActivityVerbosity } from './openaiActivityLabels.js';
import { executeOpenAIHostTool, isOpenAIHostTool, OPENAI_HOST_ACTIVITY_TOOLS } from './openaiHostTools.js';
import { OpenAIStreamCoalescer } from './openaiStreamCoalescer.js';

interface IOpenAISessionRecord {
	readonly session: URI;
	readonly createdAt: number;
	workingDirectory?: URI;
	project?: IAgentSessionProjectInfo;
	model?: ModelSelection;
	config?: Record<string, unknown>;
	summary?: string;
	activeClient?: {
		readonly clientId: string;
		readonly tools: readonly ToolDefinition[];
	};
	active?: {
		readonly turnId: string;
		readonly abortController: AbortController;
	};
	currentActivity?: string;
	activeTurnToolCalls?: Map<string, IOpenAIActiveToolCallState>;
}

interface IOpenAIActiveToolCallState {
	readonly toolCall: IOpenAIToolCall;
	readonly activity: ReturnType<typeof getOpenAIActivityLabel>;
}

interface IOpenAIToolApproval {
	readonly session: URI;
	readonly turnId: string;
	readonly toolCall: IOpenAIToolCall;
	resolve(value: boolean): void;
}

interface IOpenAIClientToolResultWaiter {
	resolve(value: ToolCallResult): void;
}

interface IOpenAITranscriptEntry {
	readonly role: 'user' | 'assistant';
	readonly content: string;
	readonly timestamp: number;
}

interface IOpenAIPersistedSession {
	readonly session: string;
	readonly createdAt: number;
	readonly modifiedAt: number;
	readonly summary?: string;
	readonly workingDirectory?: string;
	readonly project?: IAgentSessionProjectInfo;
	readonly model?: ModelSelection;
	readonly config?: Record<string, unknown>;
}

const OPENAI_SESSION_INDEX_FILE = 'quantumide-openai-sessions.json';
const OPENAI_TRANSCRIPT_METADATA_KEY = 'openai.transcript';
const MAX_OPENAI_HISTORY_MESSAGES = 24;
const MAX_OPENAI_HISTORY_CHARS = 48_000;
const MAX_OPENAI_CUSTOMIZATION_CHARS = 24_000;
const MAX_OPENAI_ATTACHMENT_CONTEXT_CHARS = 18_000;
const DEFAULT_OPENAI_STREAM_COALESCE_MS = 24;
const MAX_OPENAI_STREAM_COALESCE_MS = 80;
const DEFAULT_OPENAI_MAX_TOOL_ITERATIONS = 8;
const DEFAULT_OPENAI_MAX_ACTIVITY_STEPS_PER_TURN = 50;

function defaultOpenAIModels(provider: string): readonly IAgentModelInfo[] {
	const configured = process.env['QUANTUMIDE_OPENAI_MODEL'] || 'gpt-4.1';
	return [
		{ provider, id: configured, name: configured, supportsVision: isOpenAIVisionModel(configured) },
		{ provider, id: 'gpt-4.1-mini', name: 'gpt-4.1-mini', supportsVision: false },
		{ provider, id: 'gpt-4o', name: 'gpt-4o', supportsVision: true },
	];
}

function isOpenAIVisionModel(id: string): boolean {
	return /(^|[-_])(4o|vision|omni)([-_]|$)/i.test(id);
}

export function buildOpenAIAttachmentPrompt(attachments: readonly MessageAttachment[], maxChars = MAX_OPENAI_ATTACHMENT_CONTEXT_CHARS): string {
	if (attachments.length === 0) {
		return '';
	}
	const sections: string[] = [];
	let remaining = maxChars;
	for (const attachment of attachments) {
		if (remaining <= 0) {
			break;
		}
		if (attachment.type === MessageAttachmentKind.Simple && attachment.modelRepresentation) {
			const header = `Attachment: ${attachment.label}`;
			const content = attachment.modelRepresentation.slice(0, Math.max(0, remaining - header.length - 2));
			if (!content) {
				break;
			}
			sections.push(`${header}\n${content}`);
			remaining -= header.length + content.length + 2;
		} else if (attachment.type === MessageAttachmentKind.Resource) {
			const line = `Referenced resource: ${attachment.label} (${attachment.uri})`;
			sections.push(line);
			remaining -= line.length + 1;
		} else if (attachment.type === MessageAttachmentKind.EmbeddedResource) {
			const line = `Embedded resource: ${attachment.label}${attachment.contentType ? ` (${attachment.contentType})` : ''}`;
			sections.push(line);
			remaining -= line.length + 1;
		}
	}
	return sections.length ? `Context attachments:\n${sections.join('\n\n')}` : '';
}

const OPENAI_PROPOSAL_TOOLS: readonly IOpenAIToolDefinition[] = [
	{
		type: 'function',
		function: {
			name: 'propose_file_edit',
			description: 'Propose a file edit for the user to review before anything is applied.',
			parameters: {
				type: 'object',
				properties: {
					path: { type: 'string', description: 'Workspace-relative or absolute file path to edit.' },
					summary: { type: 'string', description: 'Short explanation of why the edit is needed.' },
					replacement: { type: 'string', description: 'Replacement text or patch content to present to the user.' },
				},
				required: ['path', 'summary', 'replacement'],
				additionalProperties: false,
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'propose_terminal_command',
			description: 'Propose a terminal command for explicit user confirmation before execution.',
			parameters: {
				type: 'object',
				properties: {
					command: { type: 'string', description: 'The terminal command to run.' },
					reason: { type: 'string', description: 'Why the command is useful and what it is expected to do.' },
				},
				required: ['command', 'reason'],
				additionalProperties: false,
			},
		},
	},
];

const quantumIDEOpenAIConfigSchema = createSchema({
	[QuantumIDEAISettingId.OpenAIStreamingEnabled]: schemaProperty<boolean>({
		type: 'boolean',
		title: 'OpenAI Streaming Enabled',
	}),
	[QuantumIDEAISettingId.OpenAIStreamingCoalesceMs]: schemaProperty<number>({
		type: 'number',
		title: 'OpenAI Streaming Coalesce Interval (ms)',
	}),
	[QuantumIDEAISettingId.OpenAIStreamingAdaptiveCoalescing]: schemaProperty<boolean>({
		type: 'boolean',
		title: 'OpenAI Adaptive Streaming Coalescing',
	}),
	[QuantumIDEAISettingId.AgentMaxToolIterations]: schemaProperty<number>({
		type: 'number',
		title: 'OpenAI Max Tool Iterations',
	}),
	[QuantumIDEAISettingId.AgentActivityVerbosity]: schemaProperty<string>({
		type: 'string',
		title: 'OpenAI Activity Verbosity',
	}),
	[QuantumIDEAISettingId.AgentMaxActivityStepsPerTurn]: schemaProperty<number>({
		type: 'number',
		title: 'OpenAI Max Activity Steps Per Turn',
	}),
});

const quantumIDEModelRouterConfigSchema = createSchema({
	[QuantumIDEModelRouterConfigKey]: schemaProperty<IQuantumIDEModelRoute[]>({
		type: 'array',
		title: 'QuantumIDE Model Routes',
		items: {
			type: 'object',
			title: 'Model Route',
			required: ['id', 'provider', 'model'],
			properties: {
				id: { type: 'string', title: 'Route ID' },
				provider: { type: 'string', title: 'Provider' },
				model: { type: 'string', title: 'Model' },
				displayName: { type: 'string', title: 'Display Name' },
				baseUrl: { type: 'string', title: 'Base URL' },
				tier: { type: 'string', title: 'Tier' },
				enabled: { type: 'boolean', title: 'Enabled' },
			},
		},
	}),
});

export class OpenAIAgent extends Disposable implements IAgent {
	readonly id = QuantumIDEOpenAIProviderId;

	private static readonly _streamingSupportedByEndpoint = new Map<string, boolean>();

	private readonly _onDidSessionProgress = this._register(new Emitter<AgentSignal>());
	readonly onDidSessionProgress = this._onDidSessionProgress.event;

	private readonly _models = observableValue<readonly IAgentModelInfo[]>(this, defaultOpenAIModels(this.id));
	readonly models = this._models;

	private readonly _sessions = new Map<string, IOpenAISessionRecord>();
	private readonly _pendingToolApprovals = new Map<string, IOpenAIToolApproval>();
	private readonly _pendingClientToolResults = new Map<string, IOpenAIClientToolResultWaiter>();
	private readonly _customizationEnablement = new Map<string, boolean>();
	private _clientCustomizations: readonly ISyncedCustomization[] = [];
	private _apiKey: string | undefined;

	constructor(
		@ILogService private readonly _logService: ILogService,
		@ISessionDataService private readonly _sessionDataService: ISessionDataService,
		@IFileService private readonly _fileService: IFileService,
		@INativeEnvironmentService private readonly _environmentService: INativeEnvironmentService,
		@IAgentPluginManager private readonly _pluginManager: IAgentPluginManager,
		@IAgentConfigurationService private readonly _configurationService: IAgentConfigurationService,
	) {
		super();
		this._applyConfiguredModelRoutes();
		this._register(this._configurationService.onDidRootConfigChange(() => this._applyConfiguredModelRoutes()));
		if (process.env[QuantumIDEOpenAIApiKeyEnvVar]) {
			this._refreshModelsFromClient(this._createClient()).catch(error => {
				this._logService.warn('[OpenAI] Environment API key is configured, but initial model catalog refresh failed', error);
			});
		}
	}

	getDescriptor(): IAgentDescriptor {
		return {
			provider: this.id,
			displayName: 'ChatGPT / OpenAI',
			description: 'QuantumIDE agent provider for OpenAI-compatible ChatGPT models',
		};
	}

	getProtectedResources(): ProtectedResourceMetadata[] {
		return [{
			resource: QuantumIDEOpenAIProtectedResourceId,
			resource_name: 'QuantumIDE OpenAI API Key',
			bearer_methods_supported: ['header'],
			required: !process.env[QuantumIDEOpenAIApiKeyEnvVar],
		}];
	}

	async authenticate(resource: string, token: string): Promise<boolean> {
		if (resource !== QuantumIDEOpenAIProtectedResourceId) {
			return false;
		}
		const trimmed = token.trim();
		this._apiKey = trimmed || undefined;
		if (!this._apiKey) {
			this._models.set(defaultOpenAIModels(this.id), undefined);
			this._logService.info('[OpenAI] Cleared workbench-forwarded API key');
			return true;
		}
		try {
			await this._refreshModelsFromClient(this._createClient());
			this._logService.info('[OpenAI] Authenticated with workbench-forwarded API key and refreshed model catalog');
		} catch (error) {
			this._logService.warn('[OpenAI] API key was received, but model catalog refresh failed', error);
			return false;
		}
		return true;
	}

	async createSession(config?: IAgentCreateSessionConfig): Promise<IAgentCreateSessionResult> {
		const session = config?.session ?? AgentSession.uri(this.id, generateUuid());
		const project = config?.workingDirectory ? {
			uri: config.workingDirectory,
			displayName: config.workingDirectory.path.split('/').filter(Boolean).at(-1) ?? 'Workspace',
		} : undefined;
		const record: IOpenAISessionRecord = {
			session,
			createdAt: Date.now(),
			summary: 'ChatGPT / OpenAI session',
		};
		if (config?.workingDirectory) {
			record.workingDirectory = config.workingDirectory;
		}
		if (project) {
			record.project = project;
		}
		if (config?.model) {
			record.model = config.model;
		}
		if (config?.config) {
			record.config = config.config;
		}
		this._sessions.set(session.toString(), record);
		await this._persistSessionRecord(record);
		const result: IAgentCreateSessionResult = { session };
		if (config?.workingDirectory) {
			return {
				...result,
				workingDirectory: config.workingDirectory,
				...(project ? { project } : {}),
			};
		}
		return {
			session,
			...(project ? { project } : {}),
		};
	}

	async resolveSessionConfig(params: IAgentResolveSessionConfigParams): Promise<ResolveSessionConfigResult> {
		return {
			schema: {
				type: 'object',
				properties: {
					[OpenAISessionConfigKey.SystemPrompt]: {
						type: 'string',
						title: localize('openai.config.systemPrompt', 'System Prompt'),
						description: localize('openai.config.systemPrompt.description', 'Instruction prepended to ChatGPT/OpenAI requests for this session.'),
						default: OPENAI_DEFAULT_SYSTEM_PROMPT,
						sessionMutable: true,
					},
					[OpenAISessionConfigKey.Temperature]: {
						type: 'number',
						title: localize('openai.config.temperature', 'Temperature'),
						description: localize('openai.config.temperature.description', 'Controls response creativity. Lower values are more deterministic.'),
						default: 0.2,
						sessionMutable: true,
					},
				},
			},
			values: {
				[OpenAISessionConfigKey.SystemPrompt]: String(params.config?.[OpenAISessionConfigKey.SystemPrompt] ?? OPENAI_DEFAULT_SYSTEM_PROMPT),
				[OpenAISessionConfigKey.Temperature]: Number(params.config?.[OpenAISessionConfigKey.Temperature] ?? 0.2),
			},
		};
	}

	async sessionConfigCompletions(_params: IAgentSessionConfigCompletionsParams): Promise<SessionConfigCompletionsResult> {
		return { items: [] };
	}

	async sendMessage(session: URI, prompt: string, attachments: readonly MessageAttachment[] = [], turnId = generateUuid()): Promise<void> {
		const key = session.toString();
		const record = this._sessions.get(key);
		if (!record) {
			throw new Error(`Unknown OpenAI session: ${key}`);
		}

		const abortController = new AbortController();
		record.active = { turnId, abortController };
		record.summary = prompt.slice(0, 80) || record.summary;

		const sessionStr = session.toString();
		const partId = `${turnId}#openai-response`;
		const reasoningPartId = `${turnId}#openai-reasoning`;
		record.activeTurnToolCalls = new Map();
		this._logService.info(`[OpenAI] turn started session=${sessionStr} turn=${turnId} model=${record.model?.id ?? process.env['QUANTUMIDE_OPENAI_MODEL'] ?? 'gpt-4.1'} attachments=${attachments.length}`);
		this._setSessionActivity(record, session, getAgentStatusActivityLabel('thinking'));
		this._onDidSessionProgress.fire({
			kind: 'action',
			session,
			action: {
				type: ActionType.SessionTurnStarted,
				session: sessionStr,
				turnId,
				userMessage: { text: prompt, attachments: [...attachments] },
			},
		});
		this._onDidSessionProgress.fire({
			kind: 'action',
			session,
			action: {
				type: ActionType.SessionResponsePart,
				session: sessionStr,
				turnId,
				part: { kind: ResponsePartKind.Markdown, id: partId, content: '' },
			},
		});

		let assistantTranscript = '';
		let streamedText = '';
		try {
			const selectedModelId = record.model?.id ?? process.env['QUANTUMIDE_OPENAI_MODEL'] ?? 'gpt-4.1';
			const selectedRoute = this._resolveModelRoute(selectedModelId);
			const client = this._createClientForModel(selectedModelId);
			const transcript = await this._readTranscript(record);
			await this._appendTranscript(record, { role: 'user', content: prompt, timestamp: Date.now() });
			const clientToolNameMap = new Map<string, string>();
			const streamContext = {
				session,
				sessionStr,
				turnId,
				partId,
				reasoningPartId,
				reasoningPartCreated: false,
			};
			const loopResult = await this._runAgentTurnLoop({
				record,
				session,
				sessionStr,
				turnId,
				partId,
				reasoningPartId,
				client,
				model: selectedRoute?.model ?? selectedModelId,
				modelId: selectedModelId,
				initialMessages: await this._buildRequestMessages(record, transcript, prompt, attachments),
				clientToolNameMap,
				streamContext,
				signal: abortController.signal,
				onAnswerDelta: delta => {
					streamedText += delta;
					this._emitSessionDelta(session, sessionStr, turnId, partId, delta);
				},
			});
			assistantTranscript = loopResult.assistantTranscript;
			if (loopResult.inputTokens !== undefined || loopResult.outputTokens !== undefined) {
				this._onDidSessionProgress.fire({
					kind: 'action',
					session,
					action: {
						type: ActionType.SessionUsage,
						session: sessionStr,
						turnId,
						usage: {
							inputTokens: loopResult.inputTokens,
							outputTokens: loopResult.outputTokens,
						},
					},
				});
			}
			this._logService.info(`[OpenAI] turn completed session=${sessionStr} turn=${turnId} inputTokens=${loopResult.inputTokens ?? 'unknown'} outputTokens=${loopResult.outputTokens ?? 'unknown'} activitySteps=${loopResult.activityStepCount} toolIterations=${loopResult.toolIterations} timeToFirstActivityMs=${loopResult.timeToFirstActivityMs ?? 'n/a'} timeToFirstAnswerMs=${loopResult.timeToFirstAnswerMs ?? 'n/a'}`);
			this._setSessionActivity(record, session, undefined);
			await this._persistSessionRecord(record);
			this._onDidSessionProgress.fire({
				kind: 'action',
				session,
				action: {
					type: ActionType.SessionTurnComplete,
					session: sessionStr,
					turnId,
				},
			});
		} catch (error) {
			this._setSessionActivity(record, session, undefined);
			const cancelled = abortController.signal.aborted || (error instanceof Error && error.message.includes('cancelled'));
			if (cancelled) {
				this._cancelActiveToolCalls(record, session, sessionStr, turnId);
				const partial = assistantTranscript || streamedText;
				if (partial) {
					await this._appendTranscript(record, { role: 'assistant', content: partial, timestamp: Date.now() }).catch(() => undefined);
					await this._persistSessionRecord(record).catch(() => undefined);
				}
				this._logService.info(`[OpenAI] turn cancelled session=${sessionStr} turn=${turnId}`);
				this._onDidSessionProgress.fire({
					kind: 'action',
					session,
					action: {
						type: ActionType.SessionTurnCancelled,
						session: sessionStr,
						turnId,
					},
				});
				return;
			}
			this._logService.error('[OpenAI] sendMessage failed', error);
			this._onDidSessionProgress.fire({
				kind: 'action',
				session,
				action: {
					type: ActionType.SessionError,
					session: sessionStr,
					turnId,
					error: {
						errorType: 'openai-request-failed',
						message: error instanceof Error ? error.message : String(error),
					},
				},
			});
		} finally {
			record.activeTurnToolCalls = undefined;
			if (record.active?.turnId === turnId) {
				delete record.active;
			}
		}
	}

	setPendingMessages(_session: URI, _steeringMessage: PendingMessage | undefined, _queuedMessages: readonly PendingMessage[]): void {
		// OpenAI provider scaffolding does not yet support mid-turn steering.
	}

	async getSessionMessages(session: URI): Promise<readonly Turn[]> {
		await this._loadPersistedSessions();
		const record = this._sessions.get(session.toString());
		if (!record) {
			return [];
		}
		return this._transcriptToTurns(await this._readTranscript(record));
	}

	async disposeSession(session: URI): Promise<void> {
		this._sessions.get(session.toString())?.active?.abortController.abort();
		this._denyPendingToolApprovalsForSession(session);
		this._sessions.delete(session.toString());
		await this._removePersistedSessionRecord(session);
	}

	async abortSession(session: URI): Promise<void> {
		const record = this._sessions.get(session.toString());
		record?.active?.abortController.abort();
		this._denyPendingToolApprovalsForSession(session);
		if (record?.active) {
			this._logService.info(`[OpenAI] turn aborted session=${session.toString()} turn=${record.active.turnId}`);
			this._cancelActiveToolCalls(record, session, session.toString(), record.active.turnId);
			this._setSessionActivity(record, session, undefined);
			this._onDidSessionProgress.fire({
				kind: 'action',
				session,
				action: {
					type: ActionType.SessionTurnCancelled,
					session: session.toString(),
					turnId: record.active.turnId,
				},
			});
		}
	}

	async changeModel(session: URI, model: ModelSelection): Promise<void> {
		const record = this._sessions.get(session.toString());
		if (record) {
			record.model = model;
			await this._persistSessionRecord(record);
		}
	}

	respondToPermissionRequest(_requestId: string, _approved: boolean): void {
		const pending = this._pendingToolApprovals.get(_requestId);
		if (!pending) {
			return;
		}
		this._pendingToolApprovals.delete(_requestId);
		pending.resolve(_approved);
	}

	respondToUserInputRequest(_requestId: string, _response: SessionInputResponseKind, _answers?: Record<string, SessionInputAnswer>): void {
		// OpenAI provider scaffolding has no user-input tool yet.
	}

	async setClientCustomizations(clientId: string, customizations: CustomizationRef[], progress?: (results: ISyncedCustomization[]) => void): Promise<ISyncedCustomization[]> {
		this._clientCustomizations = customizations.map(customization => ({
			customization: {
				customization,
				clientId,
				enabled: this._isCustomizationEnabled(customization.uri),
				status: CustomizationStatus.Loading,
			},
		}));
		progress?.([...this._clientCustomizations]);

		const results = await this._pluginManager.syncCustomizations(clientId, customizations, status => {
			this._clientCustomizations = status.map(customization => ({
				customization: this._withCustomizationClientAndEnablement(customization, clientId),
			}));
			progress?.([...this._clientCustomizations]);
		});
		this._clientCustomizations = results.map(result => ({
			customization: this._withCustomizationClientAndEnablement(result.customization, clientId),
			...(result.pluginDir ? { pluginDir: result.pluginDir } : {}),
		}));
		return [...this._clientCustomizations];
	}

	setClientTools(_session: URI, _clientId: string, _tools: ToolDefinition[]): void {
		const record = this._sessions.get(_session.toString());
		if (!record) {
			return;
		}
		record.activeClient = { clientId: _clientId, tools: [..._tools] };
	}

	onClientToolCallComplete(_session: URI, _toolCallId: string, _result: ToolCallResult): void {
		const waiter = this._pendingClientToolResults.get(_toolCallId);
		if (!waiter) {
			return;
		}
		this._pendingClientToolResults.delete(_toolCallId);
		waiter.resolve(_result);
	}

	setCustomizationEnabled(uri: string, enabled: boolean): void {
		this._customizationEnablement.set(uri, enabled);
		this._clientCustomizations = this._clientCustomizations.map(item => ({
			...item,
			customization: {
				...item.customization,
				enabled: this._isCustomizationEnabled(item.customization.customization.uri),
			},
		}));
	}

	async shutdown(): Promise<void> {
		for (const record of this._sessions.values()) {
			record.active?.abortController.abort();
		}
		for (const pending of this._pendingToolApprovals.values()) {
			pending.resolve(false);
		}
		this._pendingToolApprovals.clear();
		for (const pending of this._pendingClientToolResults.values()) {
			pending.resolve({ success: false, pastTenseMessage: 'Cancelled tool call', error: { message: 'OpenAI agent shut down before the client tool completed.' } });
		}
		this._pendingClientToolResults.clear();
		this._sessions.clear();
	}

	async listSessions(): Promise<IAgentSessionMetadata[]> {
		await this._loadPersistedSessions();
		return [...this._sessions.values()].map(record => {
			const metadata: IAgentSessionMetadata = {
				session: record.session,
				startTime: record.createdAt,
				modifiedTime: Date.now(),
				summary: record.summary ?? 'ChatGPT / OpenAI session',
				status: record.active ? SessionStatus.InProgress : SessionStatus.Idle,
				...(record.currentActivity ? { activity: record.currentActivity } : {}),
			};
			return {
				...metadata,
				...(record.project ? { project: record.project } : {}),
				...(record.model ? { model: record.model } : {}),
				...(record.workingDirectory ? { workingDirectory: record.workingDirectory } : {}),
			};
		});
	}

	private _getMaxToolIterations(): number {
		const configured = this._configurationService.getRootValue(quantumIDEOpenAIConfigSchema, QuantumIDEAISettingId.AgentMaxToolIterations);
		if (typeof configured === 'number' && configured >= 1 && configured <= 32) {
			return configured;
		}
		return DEFAULT_OPENAI_MAX_TOOL_ITERATIONS;
	}

	private _getMaxActivityStepsPerTurn(): number {
		const configured = this._configurationService.getRootValue(quantumIDEOpenAIConfigSchema, QuantumIDEAISettingId.AgentMaxActivityStepsPerTurn);
		if (typeof configured === 'number' && configured >= 1 && configured <= 200) {
			return configured;
		}
		return DEFAULT_OPENAI_MAX_ACTIVITY_STEPS_PER_TURN;
	}

	private _canEmitActivityStep(activityStepCount: number): boolean {
		return activityStepCount < this._getMaxActivityStepsPerTurn();
	}

	private _getActivityVerbosity(): OpenAIActivityVerbosity {
		if (process.env[QuantumIDEAgentActivityEnvVar] === 'verbose') {
			return 'verbose';
		}
		if (process.env[QuantumIDEAgentActivityEnvVar] === 'minimal') {
			return 'minimal';
		}
		const configured = this._configurationService.getRootValue(quantumIDEOpenAIConfigSchema, QuantumIDEAISettingId.AgentActivityVerbosity);
		return configured === 'minimal' || configured === 'verbose' ? configured : 'normal';
	}

	private _trackActiveToolCall(record: IOpenAISessionRecord, toolCall: IOpenAIToolCall, activity: ReturnType<typeof getOpenAIActivityLabel>): void {
		if (!record.activeTurnToolCalls) {
			record.activeTurnToolCalls = new Map();
		}
		record.activeTurnToolCalls.set(toolCall.id, { toolCall, activity });
	}

	private _untrackActiveToolCall(record: IOpenAISessionRecord, toolCallId: string): void {
		record.activeTurnToolCalls?.delete(toolCallId);
	}

	private _cancelActiveToolCalls(record: IOpenAISessionRecord, session: URI, sessionStr: string, turnId: string): void {
		if (!record.activeTurnToolCalls?.size) {
			return;
		}
		for (const active of record.activeTurnToolCalls.values()) {
			this._emitToolCallComplete(session, turnId, active.toolCall, false, active.activity, 'Cancelled by user.');
		}
		record.activeTurnToolCalls.clear();
	}

	private _setSessionActivity(record: IOpenAISessionRecord, session: URI, activity: string | undefined): void {
		if (record.currentActivity === activity) {
			return;
		}
		record.currentActivity = activity;
		const activityAction: SessionActivityChangedAction = {
			type: ActionType.SessionActivityChanged,
			session: session.toString(),
			activity,
		};
		this._onDidSessionProgress.fire({
			kind: 'action',
			session,
			action: activityAction,
		});
	}

	private async _runAgentTurnLoop(options: {
		record: IOpenAISessionRecord;
		session: URI;
		sessionStr: string;
		turnId: string;
		partId: string;
		client: OpenAIClient;
		model: string;
		modelId: string;
		initialMessages: IOpenAIMessage[];
		clientToolNameMap: Map<string, string>;
		streamContext: {
			session: URI;
			sessionStr: string;
			turnId: string;
			partId: string;
			reasoningPartId: string;
			reasoningPartCreated: boolean;
		};
		reasoningPartId: string;
		signal: AbortSignal;
		onAnswerDelta: (delta: string) => void;
	}): Promise<{
		assistantTranscript: string;
		inputTokens?: number;
		outputTokens?: number;
		activityStepCount: number;
		toolIterations: number;
		timeToFirstActivityMs?: number;
		timeToFirstAnswerMs?: number;
	}> {
		const turnStartedAt = Date.now();
		let messages = [...options.initialMessages];
		let assistantTranscript = '';
		let inputTokens: number | undefined;
		let outputTokens: number | undefined;
		let activityStepCount = 0;
		let toolIterations = 0;
		let timeToFirstActivityMs: number | undefined;
		let timeToFirstAnswerMs: number | undefined;
		const maxIterations = this._getMaxToolIterations();
		const tools = [
			...OPENAI_HOST_ACTIVITY_TOOLS,
			...OPENAI_PROPOSAL_TOOLS,
			...this._getClientOpenAIToolDefinitions(options.record, options.clientToolNameMap),
		];
		const announcedStreamTools = new Set<number>();

		for (let iteration = 0; iteration <= maxIterations; iteration++) {
			const response = await this._runChat(options.client, {
				model: options.model,
				temperature: this._getSessionTemperature(options.record),
				signal: options.signal,
				tools,
				messages,
			}, delta => {
				if (timeToFirstAnswerMs === undefined && delta) {
					timeToFirstAnswerMs = Date.now() - turnStartedAt;
					this._setSessionActivity(options.record, options.session, undefined);
				}
				options.onAnswerDelta(delta);
			}, {
				...options.streamContext,
				onToolCallName: chunk => {
					if (announcedStreamTools.has(chunk.index)) {
						return;
					}
					announcedStreamTools.add(chunk.index);
					const label = getOpenAIActivityLabel(chunk.name, {}, this._getActivityVerbosity());
					if (timeToFirstActivityMs === undefined) {
						timeToFirstActivityMs = Date.now() - turnStartedAt;
					}
					if (this._canEmitActivityStep(activityStepCount)) {
						activityStepCount++;
						this._setSessionActivity(options.record, options.session, label.label);
						const previewId = chunk.id ?? `stream-tool-${chunk.index}`;
						const previewToolCall: IOpenAIToolCall = { id: previewId, name: chunk.name, arguments: '{}' };
						this._trackActiveToolCall(options.record, previewToolCall, label);
						this._emitPreviewToolCallStart(options.session, options.turnId, previewId, chunk.name, label);
					}
				},
				onReasoningDelta: content => {
					this._emitReasoningDelta(options.session, options.sessionStr, options.turnId, options.streamContext, content);
					this._setSessionActivity(options.record, options.session, getAgentStatusActivityLabel('thinking'));
				},
			}, options.modelId);

			inputTokens = response.inputTokens ?? inputTokens;
			outputTokens = response.outputTokens ?? outputTokens;

			if (response.text) {
				assistantTranscript = assistantTranscript ? `${assistantTranscript}\n\n${response.text}` : response.text;
				messages = [...messages, { role: 'assistant', content: response.text }];
				await this._appendTranscript(options.record, { role: 'assistant', content: response.text, timestamp: Date.now() });
			}

			if (!response.toolCalls?.length) {
				break;
			}
			if (iteration >= maxIterations) {
				const limitMessage = `\n\nStopped after ${maxIterations} tool rounds.`;
				assistantTranscript += limitMessage;
				options.onAnswerDelta(limitMessage);
				break;
			}

			toolIterations++;
			const toolResults = await this._executeToolCalls(options.session, options.turnId, response.toolCalls, options.clientToolNameMap, options.record, () => activityStepCount, n => { activityStepCount += n; });
			if (timeToFirstActivityMs === undefined) {
				timeToFirstActivityMs = Date.now() - turnStartedAt;
			}
			const toolMessage = `Tool results:\n\n${toolResults}`;
			messages = [...messages, { role: 'user', content: toolMessage }];
		}

		return {
			assistantTranscript,
			inputTokens,
			outputTokens,
			activityStepCount,
			toolIterations,
			timeToFirstActivityMs,
			timeToFirstAnswerMs,
		};
	}

	private _emitPreviewToolCallStart(session: URI, turnId: string, toolCallId: string, toolName: string, activity: ReturnType<typeof getOpenAIActivityLabel>): void {
		this._onDidSessionProgress.fire({
			kind: 'action',
			session,
			action: {
				type: ActionType.SessionToolCallStart,
				session: session.toString(),
				turnId,
				toolCallId,
				toolName,
				displayName: activity.label,
				_meta: { toolKind: activity.kind },
			},
		});
	}

	private _emitReasoningDelta(
		session: URI,
		sessionStr: string,
		turnId: string,
		streamContext: { reasoningPartId: string; reasoningPartCreated: boolean },
		content: string,
	): void {
		if (!content) {
			return;
		}
		if (!streamContext.reasoningPartCreated) {
			streamContext.reasoningPartCreated = true;
			this._onDidSessionProgress.fire({
				kind: 'action',
				session,
				action: {
					type: ActionType.SessionResponsePart,
					session: sessionStr,
					turnId,
					part: { kind: ResponsePartKind.Reasoning, id: streamContext.reasoningPartId, content: '' },
				},
			});
		}
		this._onDidSessionProgress.fire({
			kind: 'action',
			session,
			action: {
				type: ActionType.SessionReasoning,
				session: sessionStr,
				turnId,
				partId: streamContext.reasoningPartId,
				content,
			},
		});
	}

	private _emitSessionDelta(session: URI, sessionStr: string, turnId: string, partId: string, content: string): void {
		if (!content) {
			return;
		}
		this._onDidSessionProgress.fire({
			kind: 'action',
			session,
			action: {
				type: ActionType.SessionDelta,
				session: sessionStr,
				turnId,
				partId,
				content,
			},
		});
	}

	private _isStreamingEnabled(): boolean {
		const env = process.env[QuantumIDEOpenAIStreamEnvVar]?.trim().toLowerCase();
		if (env === '0' || env === 'false' || env === 'off') {
			return false;
		}
		const configured = this._configurationService.getRootValue(quantumIDEOpenAIConfigSchema, QuantumIDEAISettingId.OpenAIStreamingEnabled);
		return configured !== false;
	}

	private _getStreamCoalesceMs(): number {
		const configured = this._configurationService.getRootValue(quantumIDEOpenAIConfigSchema, QuantumIDEAISettingId.OpenAIStreamingCoalesceMs);
		if (typeof configured === 'number' && configured >= 0 && configured <= 500) {
			return configured;
		}
		return DEFAULT_OPENAI_STREAM_COALESCE_MS;
	}

	private _isAdaptiveCoalescingEnabled(): boolean {
		const configured = this._configurationService.getRootValue(quantumIDEOpenAIConfigSchema, QuantumIDEAISettingId.OpenAIStreamingAdaptiveCoalescing);
		return configured !== false;
	}

	private _isStreamingSupportedForEndpoint(endpointBaseUrl: string): boolean {
		return OpenAIAgent._streamingSupportedByEndpoint.get(endpointBaseUrl) !== false;
	}

	private _markStreamingUnsupported(endpointBaseUrl: string): void {
		OpenAIAgent._streamingSupportedByEndpoint.set(endpointBaseUrl, false);
		this._logService.info(`[OpenAI] Marked endpoint as non-streaming for this session: ${endpointBaseUrl}`);
	}

	private async _runChat(
		client: OpenAIClient,
		request: IOpenAIChatRequest,
		onDelta: (content: string) => void,
		streamContext?: {
			session: URI;
			sessionStr: string;
			turnId: string;
			partId: string;
			reasoningPartId: string;
			reasoningPartCreated: boolean;
			onToolCallName?: (chunk: { readonly index: number; readonly id?: string; readonly name: string }) => void;
			onReasoningDelta?: (content: string) => void;
		},
		modelId?: string,
	): Promise<IOpenAIChatResponse> {
		const endpointBaseUrl = client.endpointBaseUrl;
		if (!this._isStreamingEnabled() || !this._isStreamingSupportedForEndpoint(endpointBaseUrl)) {
			const response = await client.chat(request);
			if (response.text) {
				onDelta(response.text);
			}
			return response;
		}

		try {
			return await this._runChatStream(client, request, onDelta, streamContext);
		} catch (error) {
			if (error instanceof OpenAIStreamNotSupportedError) {
				this._markStreamingUnsupported(endpointBaseUrl);
				this._logService.warn('[OpenAI] Streaming is not supported by this endpoint; falling back to buffered chat completions.');
				const response = await client.chat(request);
				if (response.text) {
					onDelta(response.text);
				}
				return response;
			}
			throw error;
		}
	}

	private async _runChatStream(
		client: OpenAIClient,
		request: IOpenAIChatRequest,
		onDelta: (content: string) => void,
		streamContext?: {
			session: URI;
			sessionStr: string;
			turnId: string;
			partId: string;
			reasoningPartId: string;
			reasoningPartCreated: boolean;
			onToolCallName?: (chunk: { readonly index: number; readonly id?: string; readonly name: string }) => void;
			onReasoningDelta?: (content: string) => void;
		},
	): Promise<IOpenAIChatResponse> {
		const coalescer = new OpenAIStreamCoalescer(onDelta, {
			baseCoalesceMs: this._getStreamCoalesceMs(),
			maxCoalesceMs: MAX_OPENAI_STREAM_COALESCE_MS,
			maxBurstChars: 512,
			adaptiveCoalescing: this._isAdaptiveCoalescingEnabled(),
		});
		const announcedToolIndices = new Set<number>();
		try {
			let response: IOpenAIChatResponse | undefined;
			for await (const chunk of client.chatStream(request)) {
				if (chunk.kind === OpenAIChatStreamChunkKind.Text) {
					coalescer.enqueue(chunk.content);
				} else if (chunk.kind === OpenAIChatStreamChunkKind.Reasoning && streamContext?.onReasoningDelta) {
					streamContext.onReasoningDelta(chunk.content);
				} else if (chunk.kind === OpenAIChatStreamChunkKind.ToolCallName && streamContext?.onToolCallName && !announcedToolIndices.has(chunk.index)) {
					announcedToolIndices.add(chunk.index);
					streamContext.onToolCallName(chunk);
				} else if (chunk.kind === OpenAIChatStreamChunkKind.Done) {
					coalescer.flush();
					response = {
						text: chunk.text,
						toolCalls: chunk.toolCalls,
						inputTokens: chunk.inputTokens,
						outputTokens: chunk.outputTokens,
					};
				}
			}
			coalescer.flush();
			if (!response) {
				throw new Error('OpenAI-compatible stream ended before a completion payload was received.');
			}
			const metrics = coalescer.getMetrics();
			this._logService.info(`[OpenAI] stream metrics timeToFirstDeltaMs=${metrics.timeToFirstEmitMs ?? 'n/a'} inboundChunks=${metrics.deltaCount} emittedChars=${metrics.emittedCharCount} coalesceMs=${metrics.effectiveCoalesceMs} responseChars=${response.text.length}`);
			return response;
		} finally {
			coalescer.flush();
			coalescer.dispose();
		}
	}

	private _createClient(): OpenAIClient {
		return this._createClientForModel();
	}

	private _createClientForModel(modelId?: string): OpenAIClient {
		const apiKey = this._apiKey ?? process.env[QuantumIDEOpenAIApiKeyEnvVar];
		if (!apiKey) {
			throw new Error(`Configure an OpenAI API key using QuantumIDE: Store OpenAI API Key, or set ${QuantumIDEOpenAIApiKeyEnvVar} before using the OpenAI provider.`);
		}
		const route = modelId ? this._resolveModelRoute(modelId) : undefined;
		return new OpenAIClient(route?.baseUrl ?? process.env[QuantumIDEOpenAIBaseUrlEnvVar] ?? 'https://api.openai.com/v1', apiKey);
	}

	private async _refreshModelsFromClient(client: OpenAIClient): Promise<void> {
		const listed = await client.listModels();
		if (listed.length === 0) {
			this._applyConfiguredModelRoutes();
			return;
		}
		const configuredRoutes = this._getEnabledOpenAIRoutes();
		this._models.set(configuredRoutes.length > 0 ? configuredRoutes.map(route => this._routeToModelInfo(route)) : listed.map(model => ({
			provider: this.id,
			id: model.id,
			name: model.id,
			supportsVision: isOpenAIVisionModel(model.id),
		})), undefined);
	}

	private _applyConfiguredModelRoutes(): void {
		const configured = this._getConfiguredModelRoutes();
		const routes = enabledQuantumIDEModelRoutes(configured ?? defaultQuantumIDEModelRoutes, QuantumIDEAIProvider.OpenAI);
		this._models.set(routes.length > 0 || configured ? routes.map(route => this._routeToModelInfo(route)) : defaultOpenAIModels(this.id), undefined);
	}

	private _getEnabledOpenAIRoutes(): IQuantumIDEModelRoute[] {
		return enabledQuantumIDEModelRoutes(this._getConfiguredModelRoutes() ?? defaultQuantumIDEModelRoutes, QuantumIDEAIProvider.OpenAI);
	}

	private _getConfiguredModelRoutes(): IQuantumIDEModelRoute[] | undefined {
		return this._configurationService.getRootValue(quantumIDEModelRouterConfigSchema, QuantumIDEModelRouterConfigKey);
	}

	private _resolveModelRoute(modelId: string): IQuantumIDEModelRoute | undefined {
		return this._getEnabledOpenAIRoutes().find(route => route.id === modelId || route.model === modelId);
	}

	private _routeToModelInfo(route: IQuantumIDEModelRoute): IAgentModelInfo {
		return {
			provider: this.id,
			id: route.id,
			name: route.displayName ?? route.model,
			supportsVision: isOpenAIVisionModel(route.model),
			_meta: {
				provider: route.provider,
				model: route.model,
				tier: route.tier,
				baseUrlConfigured: !!route.baseUrl,
			},
		};
	}

	private async _appendTranscript(record: IOpenAISessionRecord, entry: IOpenAITranscriptEntry): Promise<void> {
		const ref = this._sessionDataService.openDatabase(record.session);
		try {
			const existingRaw = await ref.object.getMetadata(OPENAI_TRANSCRIPT_METADATA_KEY);
			const existing = this._parseTranscript(existingRaw);
			await ref.object.setMetadata(OPENAI_TRANSCRIPT_METADATA_KEY, JSON.stringify([...existing, entry].slice(-200)));
		} finally {
			ref.dispose();
		}
	}

	private async _readTranscript(record: IOpenAISessionRecord): Promise<IOpenAITranscriptEntry[]> {
		const ref = this._sessionDataService.openDatabase(record.session);
		try {
			return this._parseTranscript(await ref.object.getMetadata(OPENAI_TRANSCRIPT_METADATA_KEY));
		} finally {
			ref.dispose();
		}
	}

	private async _buildRequestMessages(record: IOpenAISessionRecord, transcript: readonly IOpenAITranscriptEntry[], prompt: string, attachments: readonly MessageAttachment[] = []): Promise<IOpenAIMessage[]> {
		const systemPrompt = this._getSessionSystemPrompt(record);
		const customizationPrompt = await this._buildCustomizationPrompt();
		const messages: IOpenAIMessage[] = [{
			role: 'system',
			content: `${systemPrompt}${customizationPrompt}\n\nWhen you need to change files or run terminal commands, use the available proposal tools. Do not claim that a file was edited or a command was run until the user approves the proposal.`,
		}];

		let remainingChars = MAX_OPENAI_HISTORY_CHARS;
		const history: IOpenAIMessage[] = [];
		for (const entry of transcript.slice(-MAX_OPENAI_HISTORY_MESSAGES).reverse()) {
			if (remainingChars <= 0) {
				break;
			}
			const content = entry.content.slice(Math.max(0, entry.content.length - remainingChars));
			if (!content) {
				continue;
			}
			remainingChars -= content.length;
			history.unshift({ role: entry.role, content });
		}
		const attachmentPrompt = buildOpenAIAttachmentPrompt(attachments);
		messages.push(...history, { role: 'user', content: attachmentPrompt ? `${attachmentPrompt}\n\nUser request:\n${prompt}` : prompt });
		return messages;
	}

	private async _buildCustomizationPrompt(): Promise<string> {
		const enabled = this._clientCustomizations.filter(item => item.customization.enabled && item.customization.status !== CustomizationStatus.Error);
		if (enabled.length === 0) {
			return '';
		}

		const parts: string[] = [];
		let remaining = MAX_OPENAI_CUSTOMIZATION_CHARS;
		for (const item of enabled) {
			const header = this._formatCustomizationHeader(item.customization);
			const body = item.pluginDir ? await this._readCustomizationPluginText(item.pluginDir) : '';
			const text = body ? `${header}\n${body}` : header;
			if (!text.trim()) {
				continue;
			}
			const clipped = text.slice(0, remaining);
			if (!clipped) {
				break;
			}
			parts.push(clipped);
			remaining -= clipped.length;
			if (remaining <= 0) {
				break;
			}
		}
		return parts.length ? `\n\nActive QuantumIDE customizations:\n${parts.join('\n\n')}` : '';
	}

	private _formatCustomizationHeader(customization: SessionCustomization): string {
		const ref = customization.customization;
		return [
			`- ${ref.displayName}`,
			ref.description ? `  Description: ${ref.description}` : undefined,
			`  URI: ${ref.uri}`,
		].filter((line): line is string => line !== undefined).join('\n');
	}

	private async _readCustomizationPluginText(pluginDir: URI): Promise<string> {
		let plugin: IParsedPlugin | undefined;
		try {
			plugin = await parsePlugin(pluginDir, this._fileService, undefined, process.env['HOME'] ?? process.env['USERPROFILE'] ?? '');
		} catch (error) {
			this._logService.warn(`[OpenAI] Failed to parse customization plugin ${pluginDir.toString()}`, error);
			return '';
		}

		const sections: string[] = [];
		const agents = await this._readNamedMarkdownResources('Agents', plugin.agents);
		if (agents) {
			sections.push(agents);
		}
		const skills = await this._readNamedMarkdownResources('Skills', plugin.skills);
		if (skills) {
			sections.push(skills);
		}
		return sections.join('\n\n');
	}

	private async _readNamedMarkdownResources(title: string, resources: readonly INamedPluginResource[]): Promise<string> {
		const parts: string[] = [];
		for (const resource of resources) {
			try {
				const content = await this._fileService.readFile(resource.uri);
				parts.push(`  ${title.slice(0, -1)}: ${resource.name}\n${content.value.toString()}`);
			} catch (error) {
				this._logService.warn(`[OpenAI] Failed to read customization ${title.toLowerCase()} resource ${resource.uri.toString()}`, error);
			}
		}
		return parts.length ? `${title}:\n${parts.join('\n\n')}` : '';
	}

	private _transcriptToTurns(transcript: readonly IOpenAITranscriptEntry[]): Turn[] {
		const turns: Turn[] = [];
		let activeUser: IOpenAITranscriptEntry | undefined;
		let activeAssistant: string[] = [];

		const flush = () => {
			if (!activeUser) {
				activeAssistant = [];
				return;
			}
			const content = activeAssistant.join('\n\n').trim();
			turns.push({
				id: `openai-turn-${activeUser.timestamp}-${turns.length}`,
				userMessage: { text: activeUser.content },
				responseParts: content ? [{
					kind: ResponsePartKind.Markdown,
					id: `openai-response-${activeUser.timestamp}-${turns.length}`,
					content,
				}] : [],
				usage: undefined,
				state: TurnState.Complete,
			});
			activeUser = undefined;
			activeAssistant = [];
		};

		for (const entry of transcript) {
			if (entry.role === 'user') {
				flush();
				activeUser = entry;
			} else if (activeUser) {
				activeAssistant.push(entry.content);
			}
		}
		flush();
		return turns;
	}

	private _getSessionSystemPrompt(record: IOpenAISessionRecord): string {
		const value = record.config?.[OpenAISessionConfigKey.SystemPrompt];
		return typeof value === 'string' && value.trim() ? value : OPENAI_DEFAULT_SYSTEM_PROMPT;
	}

	private _getSessionTemperature(record: IOpenAISessionRecord): number {
		const value = record.config?.[OpenAISessionConfigKey.Temperature];
		return typeof value === 'number' && Number.isFinite(value) ? value : 0.2;
	}

	private _withCustomizationClientAndEnablement(customization: SessionCustomization, clientId: string): SessionCustomization {
		return {
			...customization,
			clientId,
			enabled: this._isCustomizationEnabled(customization.customization.uri),
		};
	}

	private _isCustomizationEnabled(uri: string): boolean {
		return this._customizationEnablement.get(uri) ?? true;
	}

	private _parseTranscript(raw: string | undefined): IOpenAITranscriptEntry[] {
		if (!raw) {
			return [];
		}
		try {
			const parsed = JSON.parse(raw);
			if (!Array.isArray(parsed)) {
				return [];
			}
			return parsed.flatMap(item => {
				if (!item || typeof item !== 'object') {
					return [];
				}
				const candidate = item as Partial<IOpenAITranscriptEntry>;
				return (candidate.role === 'user' || candidate.role === 'assistant') && typeof candidate.content === 'string' && typeof candidate.timestamp === 'number'
					? [candidate as IOpenAITranscriptEntry]
					: [];
			});
		} catch {
			return [];
		}
	}

	private async _persistSessionRecord(record: IOpenAISessionRecord): Promise<void> {
		const index = await this._readSessionIndex();
		const sessionKey = record.session.toString();
		const next: IOpenAIPersistedSession = {
			session: sessionKey,
			createdAt: record.createdAt,
			modifiedAt: Date.now(),
			summary: record.summary,
			...(record.workingDirectory ? { workingDirectory: record.workingDirectory.toString() } : {}),
			...(record.project ? { project: record.project } : {}),
			...(record.model ? { model: record.model } : {}),
			...(record.config ? { config: record.config } : {}),
		};
		await this._writeSessionIndex([next, ...index.filter(item => item.session !== sessionKey)].slice(0, 100));
	}

	private async _removePersistedSessionRecord(session: URI): Promise<void> {
		const sessionKey = session.toString();
		const index = await this._readSessionIndex();
		const next = index.filter(item => item.session !== sessionKey);
		if (next.length !== index.length) {
			await this._writeSessionIndex(next);
		}
	}

	private async _loadPersistedSessions(): Promise<void> {
		const index = await this._readSessionIndex();
		for (const item of index) {
			if (this._sessions.has(item.session)) {
				continue;
			}
			try {
				const session = URI.parse(item.session);
				const record: IOpenAISessionRecord = {
					session,
					createdAt: item.createdAt,
					summary: item.summary ?? 'ChatGPT / OpenAI session',
				};
				if (item.workingDirectory) {
					record.workingDirectory = URI.parse(item.workingDirectory);
				}
				if (item.project) {
					record.project = item.project;
				}
				if (item.model) {
					record.model = item.model;
				}
				if (item.config) {
					record.config = item.config;
				}
				this._sessions.set(item.session, record);
			} catch {
				this._logService.warn(`[OpenAI] Ignoring invalid persisted session entry: ${item.session}`);
			}
		}
	}

	private async _readSessionIndex(): Promise<IOpenAIPersistedSession[]> {
		try {
			const content = await this._fileService.readFile(this._sessionIndexResource());
			const parsed = JSON.parse(content.value.toString());
			if (!Array.isArray(parsed)) {
				return [];
			}
			return parsed.flatMap(item => {
				if (!item || typeof item !== 'object') {
					return [];
				}
				const candidate = item as Partial<IOpenAIPersistedSession>;
				return typeof candidate.session === 'string' && typeof candidate.createdAt === 'number' && typeof candidate.modifiedAt === 'number'
					? [candidate as IOpenAIPersistedSession]
					: [];
			});
		} catch {
			return [];
		}
	}

	private async _writeSessionIndex(index: readonly IOpenAIPersistedSession[]): Promise<void> {
		const resource = this._sessionIndexResource();
		await this._fileService.createFolder(this._sessionIndexParentResource());
		await this._fileService.writeFile(resource, VSBuffer.fromString(JSON.stringify(index, undefined, 2)));
	}

	private _sessionIndexResource(): URI {
		return joinPath(this._sessionIndexParentResource(), OPENAI_SESSION_INDEX_FILE);
	}

	private _sessionIndexParentResource(): URI {
		return joinPath(URI.file(this._environmentService.userDataPath), 'agentSessionData');
	}

	private _denyPendingToolApprovalsForSession(session: URI): void {
		const sessionKey = session.toString();
		for (const [toolCallId, pending] of this._pendingToolApprovals) {
			if (pending.session.toString() === sessionKey) {
				this._pendingToolApprovals.delete(toolCallId);
				pending.resolve(false);
			}
		}
	}

	private async _executeToolCalls(
		session: URI,
		turnId: string,
		toolCalls: readonly IOpenAIToolCall[],
		clientToolNameMap: ReadonlyMap<string, string>,
		record: IOpenAISessionRecord,
		getActivityStepCount: () => number,
		addActivitySteps: (count: number) => void,
	): Promise<string> {
		const summaries: string[] = [];
		for (const toolCall of toolCalls) {
			const args = this._parseToolArguments(toolCall);
			const activity = getOpenAIActivityLabel(toolCall.name, args, this._getActivityVerbosity());
			if (this._canEmitActivityStep(getActivityStepCount())) {
				addActivitySteps(1);
				this._setSessionActivity(record, session, activity.label);
			}
			if (isOpenAIHostTool(toolCall.name)) {
				summaries.push(await this._executeHostToolCall(session, turnId, toolCall, record, activity, getActivityStepCount));
				continue;
			}
			const clientToolName = clientToolNameMap.get(toolCall.name);
			if (clientToolName) {
				const result = await this._handleClientToolCall(session, turnId, toolCall, clientToolName, activity, getActivityStepCount, record);
				this._emitToolCallComplete(session, turnId, toolCall, result.success !== false, activity, this._summarizeToolResult(clientToolName, result), record);
				summaries.push(this._summarizeToolResult(clientToolName, result));
				continue;
			}
			if (!this._canEmitActivityStep(getActivityStepCount())) {
				summaries.push(`${toolCall.name}: skipped activity UI (step limit reached).`);
				continue;
			}
			this._emitToolCallStart(session, turnId, toolCall, activity, record);
			const approved = await this._requestToolApproval(session, turnId, toolCall, activity);
			if (approved) {
				this._emitToolCallComplete(session, turnId, toolCall, true, activity, undefined, record);
				summaries.push(this._getToolResultText(toolCall.name, args, true));
			} else {
				this._emitToolCallComplete(session, turnId, toolCall, false, activity, undefined, record);
				summaries.push(this._getToolResultText(toolCall.name, args, false));
			}
		}
		return summaries.filter(Boolean).join('\n\n');
	}

	private async _executeHostToolCall(session: URI, turnId: string, toolCall: IOpenAIToolCall, record: IOpenAISessionRecord, activity: ReturnType<typeof getOpenAIActivityLabel>, getActivityStepCount: () => number): Promise<string> {
		const args = this._parseToolArguments(toolCall);
		if (!this._canEmitActivityStep(getActivityStepCount())) {
			try {
				const result = await executeOpenAIHostTool(this._fileService, record.workingDirectory, toolCall.name, args);
				return `${toolCall.name} result:\n${result}`;
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				return `${toolCall.name} failed: ${message}`;
			}
		}
		this._emitToolCallStart(session, turnId, toolCall, activity, record);
		this._emitToolCallReady(session, turnId, toolCall, activity, ToolCallConfirmationReason.NotNeeded, `Running ${activity.label}`);
		try {
			const result = await executeOpenAIHostTool(this._fileService, record.workingDirectory, toolCall.name, args);
			this._emitToolCallComplete(session, turnId, toolCall, true, activity, result, record);
			return `${toolCall.name} result:\n${result}`;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this._emitToolCallComplete(session, turnId, toolCall, false, activity, message, record);
			return `${toolCall.name} failed: ${message}`;
		}
	}

	private _emitToolCallStart(session: URI, turnId: string, toolCall: IOpenAIToolCall, activity: ReturnType<typeof getOpenAIActivityLabel>, record?: IOpenAISessionRecord): void {
		const sessionRecord = record ?? this._sessions.get(session.toString());
		if (sessionRecord) {
			this._trackActiveToolCall(sessionRecord, toolCall, activity);
		}
		this._onDidSessionProgress.fire({
			kind: 'action',
			session,
			action: {
				type: ActionType.SessionToolCallStart,
				session: session.toString(),
				turnId,
				toolCallId: toolCall.id,
				toolName: toolCall.name,
				displayName: activity.label,
				_meta: { toolKind: activity.kind },
			},
		});
	}

	private _emitToolCallReady(session: URI, turnId: string, toolCall: IOpenAIToolCall, activity: ReturnType<typeof getOpenAIActivityLabel>, confirmed: ToolCallConfirmationReason, invocationMessage: string): void {
		this._onDidSessionProgress.fire({
			kind: 'action',
			session,
			action: {
				type: ActionType.SessionToolCallReady,
				session: session.toString(),
				turnId,
				toolCallId: toolCall.id,
				invocationMessage,
				toolInput: toolCall.arguments,
				confirmed,
			},
		});
	}

	private async _handleClientToolCall(session: URI, turnId: string, toolCall: IOpenAIToolCall, clientToolName: string, activity: ReturnType<typeof getOpenAIActivityLabel>, getActivityStepCount: () => number, record: IOpenAISessionRecord): Promise<ToolCallResult> {
		const clientId = record?.activeClient?.clientId;
		if (!clientId) {
			return { success: false, pastTenseMessage: `Failed to execute ${clientToolName}`, error: { message: 'No active client is available to run this tool.' } };
		}
		if (!this._canEmitActivityStep(getActivityStepCount())) {
			return { success: false, pastTenseMessage: `Skipped ${clientToolName}`, error: { message: 'Activity step limit reached for this turn.' } };
		}
		this._trackActiveToolCall(record, toolCall, activity);
		this._onDidSessionProgress.fire({
			kind: 'action',
			session,
			action: {
				type: ActionType.SessionToolCallStart,
				session: session.toString(),
				turnId,
				toolCallId: toolCall.id,
				toolName: clientToolName,
				displayName: activity.label,
				toolClientId: clientId,
				_meta: { toolKind: activity.kind },
			},
		});
		const resultPromise = new Promise<ToolCallResult>(resolve => {
			this._pendingClientToolResults.set(toolCall.id, { resolve });
		});
		this._onDidSessionProgress.fire({
			kind: 'action',
			session,
			action: {
				type: ActionType.SessionToolCallReady,
				session: session.toString(),
				turnId,
				toolCallId: toolCall.id,
				invocationMessage: `Run ${clientToolName}`,
				toolInput: toolCall.arguments,
				confirmed: ToolCallConfirmationReason.NotNeeded,
			},
		});
		return resultPromise;
	}

	private async _requestToolApproval(session: URI, turnId: string, toolCall: IOpenAIToolCall, activity: ReturnType<typeof getOpenAIActivityLabel>): Promise<boolean> {
		const args = this._parseToolArguments(toolCall);
		const invocationMessage = this._getToolInvocationMessage(toolCall.name, args);
		const approved = await new Promise<boolean>(resolve => {
			this._pendingToolApprovals.set(toolCall.id, { session, turnId, toolCall, resolve });
			this._emitToolCallReady(session, turnId, toolCall, activity, ToolCallConfirmationReason.UserAction, invocationMessage);
			this._onDidSessionProgress.fire({
				kind: 'pending_confirmation',
				session,
				permissionKind: toolCall.name === 'propose_terminal_command' ? 'shell' : 'write',
				permissionPath: typeof args.path === 'string' ? args.path : undefined,
				state: {
					status: ToolCallStatus.PendingConfirmation,
					toolCallId: toolCall.id,
					toolName: toolCall.name,
					displayName: activity.label,
					invocationMessage,
					confirmationTitle: activity.label,
					toolInput: toolCall.arguments,
					editable: true,
					_meta: { toolKind: activity.kind },
				},
			});
		});
		if (!approved) {
			this._logService.info(`[OpenAI] proposal denied session=${session.toString()} turn=${turnId} tool=${toolCall.name}`);
		}
		return approved;
	}

	private _emitToolCallComplete(session: URI, turnId: string, toolCall: IOpenAIToolCall, success: boolean, activity: ReturnType<typeof getOpenAIActivityLabel>, resultText?: string, record?: IOpenAISessionRecord): void {
		const sessionRecord = record ?? this._sessions.get(session.toString());
		sessionRecord && this._untrackActiveToolCall(sessionRecord, toolCall.id);
		const args = this._parseToolArguments(toolCall);
		const content = resultText ?? this._getToolResultText(toolCall.name, args, success);
		const result: ToolCallResult = {
			success,
			pastTenseMessage: success ? activity.label : `${activity.label} failed`,
			content: [{
				type: ToolResultContentType.Text,
				text: content,
			}],
			...(success ? {} : { error: { message: content } }),
		};
		this._onDidSessionProgress.fire({
			kind: 'action',
			session,
			action: {
				type: ActionType.SessionToolCallComplete,
				session: session.toString(),
				turnId,
				toolCallId: toolCall.id,
				result,
			},
		});
	}

	private _parseToolArguments(toolCall: IOpenAIToolCall): Record<string, unknown> {
		try {
			const parsed = JSON.parse(toolCall.arguments);
			return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
		} catch {
			return {};
		}
	}

	private _getClientOpenAIToolDefinitions(record: IOpenAISessionRecord, nameMap: Map<string, string>): IOpenAIToolDefinition[] {
		return (record.activeClient?.tools ?? []).flatMap(tool => {
			const openAIName = this._toOpenAIToolName(tool.name, nameMap);
			if (!openAIName) {
				return [];
			}
			nameMap.set(openAIName, tool.name);
			return [{
				type: 'function' as const,
				function: {
					name: openAIName,
					description: tool.description ?? tool.title ?? tool.name,
					parameters: tool.inputSchema ?? { type: 'object', properties: {} },
				},
			}];
		});
	}

	private _toOpenAIToolName(name: string, existing: ReadonlyMap<string, string>): string | undefined {
		const base = name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
		if (!base) {
			return undefined;
		}
		if (!existing.has(base) || existing.get(base) === name) {
			return base;
		}
		const suffix = Math.random().toString(36).slice(2, 8);
		return `${base.slice(0, Math.max(1, 64 - suffix.length - 1))}_${suffix}`;
	}

	private _summarizeToolResult(toolName: string, result: ToolCallResult): string {
		if (result.success === false) {
			return `${toolName} failed: ${result.error?.message ?? result.pastTenseMessage}`;
		}
		const text = result.content?.flatMap(part => part.type === ToolResultContentType.Text ? [part.text] : []).join('\n');
		return text ? `${toolName} result:\n${text}` : `${toolName}: ${result.pastTenseMessage}`;
	}

	private _getToolInvocationMessage(name: string, args: Record<string, unknown>): string {
		if (name === 'propose_terminal_command') {
			return `Review terminal command proposal:\n\n${String(args.command ?? '')}\n\nReason: ${String(args.reason ?? '')}`;
		}
		if (name === 'propose_file_edit') {
			return `Review file edit proposal for ${String(args.path ?? 'unknown file')}:\n\n${String(args.summary ?? '')}\n\nReplacement or patch:\n${String(args.replacement ?? '')}`;
		}
		return JSON.stringify(args, undefined, 2);
	}

	private _getToolResultText(name: string, args: Record<string, unknown>, success: boolean): string {
		if (!success) {
			return 'The user denied this proposal.';
		}
		if (name === 'propose_terminal_command') {
			return `The user approved this terminal command proposal:\n\n${String(args.command ?? '')}`;
		}
		if (name === 'propose_file_edit') {
			return `The user approved this file edit proposal for ${String(args.path ?? 'unknown file')}. The edit is still presented as a proposal and is not automatically applied.`;
		}
		return 'The user approved this proposal.';
	}
}
