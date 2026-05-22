/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../nls.js';
import { VSBuffer } from '../../base/common/buffer.js';
import { Codicon } from '../../base/common/codicons.js';
import { isAbsolute } from '../../base/common/path.js';
import { joinPath } from '../../base/common/resources.js';
import { URI } from '../../base/common/uri.js';
import { ICodeEditorService } from '../../editor/browser/services/codeEditorService.js';
import { ITextModelService } from '../../editor/common/services/resolverService.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../platform/actions/common/actions.js';
import { IAgentHostService } from '../../platform/agentHost/common/agentService.js';
import { IClipboardService } from '../../platform/clipboard/common/clipboardService.js';
import { ICommandService } from '../../platform/commands/common/commands.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../platform/configuration/common/configurationRegistry.js';
import { IConfigurationService } from '../../platform/configuration/common/configuration.js';
import { IFileService } from '../../platform/files/common/files.js';
import { ServicesAccessor } from '../../platform/instantiation/common/instantiation.js';
import { IMarkerService, MarkerSeverity } from '../../platform/markers/common/markers.js';
import { INotificationService } from '../../platform/notification/common/notification.js';
import product from '../../platform/product/common/product.js';
import { IQuickInputService } from '../../platform/quickinput/common/quickInput.js';
import { Registry } from '../../platform/registry/common/platform.js';
import { QuantumIDEAICommandId, QuantumIDEAIProvider, QuantumIDEAISettingId, QuantumIDEOpenAIApiKeySecretStorageKey, QuantumIDEOpenAIProtectedResourceId } from '../../platform/quantumide/common/quantumideAISettings.js';
import { defaultQuantumIDEModelRoutes } from '../../platform/quantumide/common/quantumideModelRouter.js';
import { summarizeQuantumIDEWorkspaceGraph } from '../../platform/quantumide/common/quantumideWorkspaceGraph.js';
import { ISecretStorageService } from '../../platform/secrets/common/secrets.js';
import { IStorageService, StorageScope, StorageTarget } from '../../platform/storage/common/storage.js';
import { TerminalLocation } from '../../platform/terminal/common/terminal.js';
import { IWorkspaceContextService } from '../../platform/workspace/common/workspace.js';
import { IQuickChatService } from '../contrib/chat/browser/chat.js';
import { ISCMService } from '../contrib/scm/common/scm.js';
import { ITerminalService } from '../contrib/terminal/browser/terminal.js';
import { IEditorService } from '../services/editor/common/editorService.js';
import { IPreferencesService } from '../services/preferences/common/preferences.js';
import { IQuantumIDEWorkspaceContextService } from '../services/quantumide/common/quantumideWorkspaceContext.js';
import {
	readAgentHandoffText,
	setPinnedTaskSpecUri,
} from '../services/quantumide/browser/quantumideAgentVelocityAttachments.js';
import { IQuantumIDEInlineDiffService } from '../services/quantumide/browser/quantumideInlineDiffService.js';
import { IQuantumIDEDiffReviewService } from '../services/quantumide/browser/quantumideDiffReviewService.js';
import { openQuantumIDESettingsPanel } from './quantumideSettingsPanel.contribution.js';

const OPEN_AGENT_SESSIONS_WELCOME_COMMAND_ID = 'workbench.action.openAgentSessionsWelcome';
const OPEN_QUANTUMIDE_OPENAI_SESSION_COMMAND_ID = 'workbench.action.chat.openNewChatSessionInPlace.agent-host-openai';
const MAX_CONTEXT_CHARS_PER_FILE = 12_000;
const MAX_DIAGNOSTICS = 12;
const MAX_SCM_RESOURCES = 40;
const MAX_DIFF_SNIPPETS = 4;
const MAX_DIFF_CHARS_PER_FILE = 4_000;
const QUANTUMIDE_AI_AUDIT_STORAGE_KEY = 'quantumide.ai.audit.recentEvents';

type QuantumIDESettingsCategory = 'general' | 'account' | 'ai' | 'editor' | 'workspace' | 'integrations' | 'security' | 'privacy' | 'extensions' | 'models' | 'advanced';

const QUANTUMIDE_SETTINGS_QUERIES: Record<QuantumIDESettingsCategory, string> = {
	general: [
		QuantumIDEAISettingId.Enabled,
		QuantumIDEAISettingId.DefaultProvider,
		QuantumIDEAISettingId.OpenAIModel,
		QuantumIDEAISettingId.OpenAIBaseUrl,
		'workbench.startupEditor',
		'workbench.colorTheme',
	].map(id => `@id:${id}`).join(' '),
	account: [
		QuantumIDEAISettingId.OpenAIApiKeyStorage,
	].map(id => `@id:${id}`).join(' '),
	ai: [
		QuantumIDEAISettingId.Enabled,
		QuantumIDEAISettingId.DefaultProvider,
		QuantumIDEAISettingId.OpenAIApiKeyStorage,
		QuantumIDEAISettingId.OpenAIModel,
		QuantumIDEAISettingId.OpenAIBaseUrl,
		QuantumIDEAISettingId.AgentMaxContextFiles,
		QuantumIDEAISettingId.AgentEditVelocity,
		QuantumIDEAISettingId.AgentVerifyOnEdit,
		QuantumIDEAISettingId.AgentAutoApplyEdits,
		QuantumIDEAISettingId.SemanticIndexingEnabled,
	].map(id => `@id:${id}`).join(' '),
	editor: [
		'workbench.colorTheme',
		'editor.fontFamily',
		'editor.fontSize',
		'editor.formatOnSave',
		'files.autoSave',
	].map(id => `@id:${id}`).join(' '),
	workspace: [
		QuantumIDEAISettingId.IndexingEnabled,
		QuantumIDEAISettingId.IndexingExcludePatterns,
		QuantumIDEAISettingId.AgentMaxContextFiles,
		'files.exclude',
		'search.exclude',
	].map(id => `@id:${id}`).join(' '),
	integrations: [
		'git.enabled',
		'terminal.integrated.defaultProfile.osx',
		'mcp',
	].map(id => `@id:${id}`).join(' '),
	security: [
		QuantumIDEAISettingId.AgentAutoApplyEdits,
		QuantumIDEAISettingId.AgentVerifyOnEdit,
		QuantumIDEAISettingId.AgentEditVelocity,
		QuantumIDEAISettingId.AgentFastApplyEdits,
		QuantumIDEAISettingId.AgentRequireConfirmationForTerminal,
		QuantumIDEAISettingId.AgentRequireConfirmationForFileDelete,
		QuantumIDEAISettingId.OpenAIApiKeyStorage,
	].map(id => `@id:${id}`).join(' '),
	privacy: [
		'telemetry.telemetryLevel',
		QuantumIDEAISettingId.AgentAuditEnabled,
	].map(id => `@id:${id}`).join(' '),
	extensions: [
		'extensions.autoUpdate',
		'extensions.ignoreRecommendations',
	].map(id => `@id:${id}`).join(' '),
	models: [
		QuantumIDEAISettingId.DefaultProvider,
		QuantumIDEAISettingId.OpenAIApiKeyStorage,
		QuantumIDEAISettingId.OpenAIModel,
		QuantumIDEAISettingId.OpenAIBaseUrl,
		QuantumIDEAISettingId.OpenAIGPT41Enabled,
		QuantumIDEAISettingId.OpenAIGPT41MiniEnabled,
		QuantumIDEAISettingId.OpenAIGPT4oEnabled,
		QuantumIDEAISettingId.OpenAIStreamingEnabled,
		QuantumIDEAISettingId.OpenAIStreamingCoalesceMs,
		QuantumIDEAISettingId.OpenAIStreamingAdaptiveCoalescing,
		QuantumIDEAISettingId.AgentShowActivitySteps,
		QuantumIDEAISettingId.ChatAgentActivityEnabled,
		QuantumIDEAISettingId.AgentActivityVerbosity,
		QuantumIDEAISettingId.AgentMaxToolIterations,
		QuantumIDEAISettingId.AgentMaxActivityStepsPerTurn,
		QuantumIDEAISettingId.AgentActivityDebugOutput,
		QuantumIDEAISettingId.ModelRouterRoutes,
	].map(id => `@id:${id}`).join(' '),
	advanced: [
		QuantumIDEAISettingId.AgentAuditEnabled,
		QuantumIDEAISettingId.SemanticIndexingEnabled,
		QuantumIDEAISettingId.OpenAIBaseUrl,
	].map(id => `@id:${id}`).join(' '),
};

interface IQuantumIDEAIFileEditProposal {
	readonly path: string;
	readonly content: string;
}

function registerQuantumIDEAIConfiguration(): void {
	const registry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
	registry.registerConfiguration({
		id: 'quantumideAI',
		order: 7,
		title: localize('quantumideAIConfigurationTitle', 'QuantumIDE AI'),
		type: 'object',
		properties: {
			[QuantumIDEAISettingId.Enabled]: {
				type: 'boolean',
				default: true,
				scope: ConfigurationScope.APPLICATION,
				markdownDescription: localize('quantumide.ai.enabled', 'Controls whether QuantumIDE AI features, agent commands, and provider integrations are enabled.'),
			},
			[QuantumIDEAISettingId.DefaultProvider]: {
				type: 'string',
				default: QuantumIDEAIProvider.Auto,
				enum: [
					QuantumIDEAIProvider.Auto,
					QuantumIDEAIProvider.OpenAI,
					QuantumIDEAIProvider.Copilot,
					QuantumIDEAIProvider.Claude,
					QuantumIDEAIProvider.Local,
				],
				enumDescriptions: [
					localize('quantumide.ai.defaultProvider.auto', 'Use the best configured provider for the current agent workflow.'),
					localize('quantumide.ai.defaultProvider.openai', 'Use ChatGPT/OpenAI-compatible models.'),
					localize('quantumide.ai.defaultProvider.copilot', 'Use the existing GitHub Copilot-backed provider.'),
					localize('quantumide.ai.defaultProvider.claude', 'Use the existing Claude Agent Host provider when configured.'),
					localize('quantumide.ai.defaultProvider.local', 'Reserve the provider slot for future local OpenAI-compatible models.'),
				],
				scope: ConfigurationScope.APPLICATION,
				markdownDescription: localize('quantumide.ai.defaultProvider', 'Controls the default AI provider for QuantumIDE agent workflows.'),
			},
			[QuantumIDEAISettingId.OpenAIApiKeyStorage]: {
				type: 'string',
				default: 'environment',
				enum: ['environment', 'secretStorage'],
				enumDescriptions: [
					localize('quantumide.ai.openai.apiKeyStorage.environment', 'Read the API key from the QUANTUMIDE_OPENAI_API_KEY environment variable.'),
					localize('quantumide.ai.openai.apiKeyStorage.secretStorage', 'Store the API key in the application secret store and forward it securely to the Agent Host for active OpenAI sessions.'),
				],
				scope: ConfigurationScope.APPLICATION,
				markdownDescription: localize('quantumide.ai.openai.apiKeyStorage', 'Controls where the ChatGPT/OpenAI API key is read from. API keys are intentionally not stored in plain JSON settings. Use [Store API Key](command:quantumide.ai.openai.storeApiKey), [Test Connection](command:quantumide.ai.openai.testConnection), and [Refresh Models](command:quantumide.ai.openai.refreshModels) from this Models settings flow for secure setup and validation.'),
			},
			[QuantumIDEAISettingId.OpenAIModel]: {
				type: 'string',
				default: 'gpt-4.1',
				scope: ConfigurationScope.APPLICATION,
				markdownDescription: localize('quantumide.ai.openai.model', 'Default ChatGPT/OpenAI-compatible model used by QuantumIDE AI. Configure access with [Store API Key](command:quantumide.ai.openai.storeApiKey), then run [Refresh Models](command:quantumide.ai.openai.refreshModels) to update the model picker with models returned by the provider.'),
			},
			[QuantumIDEAISettingId.OpenAIBaseUrl]: {
				type: 'string',
				default: 'https://api.openai.com/v1',
				scope: ConfigurationScope.APPLICATION,
				markdownDescription: localize('quantumide.ai.openai.baseUrl', 'OpenAI-compatible API base URL. Use this for OpenAI-compatible gateways or local servers. API keys are stored securely with [Store API Key](command:quantumide.ai.openai.storeApiKey), not in settings.json.'),
			},
			[QuantumIDEAISettingId.ModelRouterRoutes]: {
				type: 'array',
				default: defaultQuantumIDEModelRoutes,
				scope: ConfigurationScope.APPLICATION,
				items: {
					type: 'object',
					required: ['id', 'provider', 'model'],
					properties: {
						id: {
							type: 'string',
							description: localize('quantumide.ai.modelRouter.routes.id', 'Stable picker ID for this route.'),
						},
						provider: {
							type: 'string',
							enum: [QuantumIDEAIProvider.OpenAI, QuantumIDEAIProvider.Copilot, QuantumIDEAIProvider.Claude, QuantumIDEAIProvider.Local],
							description: localize('quantumide.ai.modelRouter.routes.provider', 'Provider that owns this route. The MVP routes OpenAI-compatible entries through the OpenAI Agent Host provider.'),
						},
						model: {
							type: 'string',
							description: localize('quantumide.ai.modelRouter.routes.model', 'Provider-native model name sent to the API.'),
						},
						displayName: {
							type: 'string',
							description: localize('quantumide.ai.modelRouter.routes.displayName', 'Human-readable label shown in the chat model picker.'),
						},
						baseUrl: {
							type: 'string',
							description: localize('quantumide.ai.modelRouter.routes.baseUrl', 'Optional OpenAI-compatible endpoint override for this route.'),
						},
						tier: {
							type: 'string',
							description: localize('quantumide.ai.modelRouter.routes.tier', 'Optional routing tier label such as fast, standard, reasoning, or vision.'),
						},
						enabled: {
							type: 'boolean',
							default: true,
							description: localize('quantumide.ai.modelRouter.routes.enabled', 'Toggle whether this route is available in the chat model picker.'),
						},
					},
					additionalProperties: false,
				},
				markdownDescription: localize('quantumide.ai.modelRouter.routes', 'Configures the enabled model routes shown in the chat model picker. Each enabled OpenAI-compatible route maps the selected model to its provider-native model, endpoint override, and tier. API keys are stored securely per provider flow with [Store API Key](command:quantumide.ai.openai.storeApiKey), never in JSON settings.'),
			},
			[QuantumIDEAISettingId.OpenAIGPT41Enabled]: {
				type: 'boolean',
				default: true,
				scope: ConfigurationScope.APPLICATION,
				markdownDescription: localize('quantumide.ai.openai.models.gpt41.enabled', 'Shows GPT-4.1 as an enabled OpenAI-compatible route in the chat model picker.'),
			},
			[QuantumIDEAISettingId.OpenAIGPT41MiniEnabled]: {
				type: 'boolean',
				default: true,
				scope: ConfigurationScope.APPLICATION,
				markdownDescription: localize('quantumide.ai.openai.models.gpt41Mini.enabled', 'Shows GPT-4.1 mini as an enabled fast OpenAI-compatible route in the chat model picker.'),
			},
			[QuantumIDEAISettingId.OpenAIGPT4oEnabled]: {
				type: 'boolean',
				default: true,
				scope: ConfigurationScope.APPLICATION,
				markdownDescription: localize('quantumide.ai.openai.models.gpt4o.enabled', 'Shows GPT-4o as an enabled vision-capable OpenAI-compatible route in the chat model picker.'),
			},
			[QuantumIDEAISettingId.OpenAIStreamingEnabled]: {
				type: 'boolean',
				default: true,
				scope: ConfigurationScope.APPLICATION,
				markdownDescription: localize('quantumide.ai.openai.streaming.enabled', 'Streams OpenAI-compatible chat responses incrementally instead of waiting for the full completion. Set the QUANTUMIDE_OPENAI_STREAM environment variable to `0` to disable streaming.'),
			},
			[QuantumIDEAISettingId.OpenAIStreamingCoalesceMs]: {
				type: 'number',
				default: 24,
				minimum: 0,
				maximum: 500,
				scope: ConfigurationScope.APPLICATION,
				markdownDescription: localize('quantumide.ai.openai.streaming.coalesceMs', 'Controls how long the OpenAI agent batches streamed text before updating the chat UI. Lower values feel more responsive; higher values reduce UI churn.'),
			},
			[QuantumIDEAISettingId.OpenAIStreamingAdaptiveCoalescing]: {
				type: 'boolean',
				default: true,
				scope: ConfigurationScope.APPLICATION,
				markdownDescription: localize('quantumide.ai.openai.streaming.adaptiveCoalescing', 'Adjusts OpenAI stream batching based on observed token throughput so bursty providers stay smooth without adding unnecessary delay to fast models.'),
			},
			[QuantumIDEAISettingId.AgentShowActivitySteps]: {
				type: 'boolean',
				default: true,
				scope: ConfigurationScope.APPLICATION,
				markdownDescription: localize('quantumide.ai.agent.showActivitySteps', 'Shows live agent activity steps (search, read, tools) in chat while the OpenAI-compatible agent works. Set the QUANTUMIDE_AGENT_ACTIVITY environment variable to `0` to disable.'),
			},
			[QuantumIDEAISettingId.ChatAgentActivityEnabled]: {
				type: 'boolean',
				default: true,
				scope: ConfigurationScope.APPLICATION,
				markdownDescription: localize('quantumide.chat.agentActivity.enabled', 'Shows Cursor-style in-chat activity messages (Planning, Grepping, Reading, etc.) during agent turns.'),
			},
			[QuantumIDEAISettingId.AgentActivityVerbosity]: {
				type: 'string',
				default: 'normal',
				enum: ['minimal', 'normal', 'verbose'],
				enumDescriptions: [
					localize('quantumide.ai.agent.activityVerbosity.minimal', 'Short activity labels with minimal detail.'),
					localize('quantumide.ai.agent.activityVerbosity.normal', 'Standard activity labels with path and query detail when available.'),
					localize('quantumide.ai.agent.activityVerbosity.verbose', 'Verbose activity labels including tool argument detail.'),
				],
				scope: ConfigurationScope.APPLICATION,
				markdownDescription: localize('quantumide.ai.agent.activityVerbosity', 'Controls how much detail appears in live agent activity step labels. Set QUANTUMIDE_AGENT_ACTIVITY to `minimal` or `verbose` to override.'),
			},
			[QuantumIDEAISettingId.AgentMaxToolIterations]: {
				type: 'number',
				default: 8,
				minimum: 1,
				maximum: 32,
				scope: ConfigurationScope.APPLICATION,
				markdownDescription: localize('quantumide.ai.agent.maxToolIterations', 'Maximum number of tool-call rounds the OpenAI-compatible agent may run per user message before stopping.'),
			},
			[QuantumIDEAISettingId.AgentIterateUntilComplete]: {
				type: 'boolean',
				default: true,
				scope: ConfigurationScope.APPLICATION,
				markdownDescription: localize('quantumide.ai.agent.iterateUntilComplete', 'When enabled, the agent continues autonomously after tool rounds if verification failed or the execution graph has pending steps.'),
			},
			[QuantumIDEAISettingId.AgentIterateUntilCompleteMaxContinuations]: {
				type: 'number',
				default: 3,
				minimum: 1,
				maximum: 8,
				scope: ConfigurationScope.APPLICATION,
				markdownDescription: localize('quantumide.ai.agent.iterateUntilCompleteMaxContinuations', 'Maximum extra continuation rounds after the initial tool loop when iterate-until-complete is enabled.'),
			},
			[QuantumIDEAISettingId.AgentMaxActivityStepsPerTurn]: {
				type: 'number',
				default: 50,
				minimum: 1,
				maximum: 200,
				scope: ConfigurationScope.APPLICATION,
				markdownDescription: localize('quantumide.ai.agent.maxActivityStepsPerTurn', 'Maximum number of live activity steps shown in chat for a single agent turn.'),
			},
			[QuantumIDEAISettingId.AgentActivityDebugOutput]: {
				type: 'boolean',
				default: true,
				scope: ConfigurationScope.APPLICATION,
				markdownDescription: localize('quantumide.ai.agent.activityDebugOutput', 'Writes agent activity steps to the **QuantumIDE Agent** output channel for debugging and support.'),
			},
			[QuantumIDEAISettingId.AgentAutoApplyEdits]: {
				type: 'boolean',
				default: true,
				scope: ConfigurationScope.RESOURCE,
				markdownDescription: localize('quantumide.ai.agent.autoApplyEdits', 'Controls whether QuantumIDE agents can apply file edits without a separate approval step. Disabled by default for safety.'),
			},
			[QuantumIDEAISettingId.AgentRequireConfirmationForTerminal]: {
				type: 'boolean',
				default: true,
				scope: ConfigurationScope.RESOURCE,
				markdownDescription: localize('quantumide.ai.agent.requireConfirmationForTerminal', 'Requires confirmation before an AI agent can run terminal commands.'),
			},
			[QuantumIDEAISettingId.AgentRequireConfirmationForFileDelete]: {
				type: 'boolean',
				default: true,
				scope: ConfigurationScope.RESOURCE,
				markdownDescription: localize('quantumide.ai.agent.requireConfirmationForFileDelete', 'Requires confirmation before an AI agent can delete files.'),
			},
			[QuantumIDEAISettingId.AgentMaxContextFiles]: {
				type: 'number',
				default: 20,
				minimum: 1,
				maximum: 200,
				scope: ConfigurationScope.RESOURCE,
				markdownDescription: localize('quantumide.ai.agent.maxContextFiles', 'Maximum number of workspace files an AI agent may include as automatic context for a task.'),
			},
			[QuantumIDEAISettingId.AgentAuditEnabled]: {
				type: 'boolean',
				default: true,
				scope: ConfigurationScope.APPLICATION,
				markdownDescription: localize('quantumide.ai.agent.audit.enabled', 'Controls whether QuantumIDE records local audit metadata for agent actions such as proposed edits, terminal commands, and approvals.'),
			},
			[QuantumIDEAISettingId.IndexingEnabled]: {
				type: 'boolean',
				default: false,
				scope: ConfigurationScope.RESOURCE,
				markdownDescription: localize('quantumide.ai.indexing.enabled', 'Enables lightweight workspace indexing for codebase Q&A and QuantumIDE AI context commands.'),
			},
			[QuantumIDEAISettingId.IndexingExcludePatterns]: {
				type: 'array',
				default: ['node_modules', '.git', 'out', 'dist', 'build', '.cache'],
				items: {
					type: 'string',
				},
				scope: ConfigurationScope.RESOURCE,
				markdownDescription: localize('quantumide.ai.indexing.excludePatterns', 'Additional folder or file names excluded from QuantumIDE workspace intelligence indexing. These are local workspace policy rules and are applied before AI context is built.'),
			},
			[QuantumIDEAISettingId.IndexingSecretFileNames]: {
				type: 'array',
				default: [],
				items: { type: 'string' },
				scope: ConfigurationScope.RESOURCE,
				markdownDescription: localize('quantumide.ai.indexing.secretFileNames', 'Extra file names blocked from indexing, @ mentions, and agent reads (in addition to .env and key material).'),
			},
			[QuantumIDEAISettingId.IndexingIgnoreFile]: {
				type: 'string',
				default: '.quantumideignore',
				scope: ConfigurationScope.RESOURCE,
				markdownDescription: localize('quantumide.ai.ignoreFile', 'Unified ignore file (gitignore syntax) for workspace indexing, @ mentions, and agent file tools. See also `quantumide-workspace-discovery-security.md`.'),
			},
			[QuantumIDEAISettingId.SemanticIndexingEnabled]: {
				type: 'boolean',
				default: false,
				scope: ConfigurationScope.RESOURCE,
				markdownDescription: localize('quantumide.ai.semanticIndexing.enabled', 'Future-ready switch for semantic/vector indexing. The MVP keeps this disabled and uses local lexical/project-graph indexing only.'),
			},
			[QuantumIDEAISettingId.AgentVelocityProfile]: {
				type: 'string',
				default: 'dev',
				enum: ['dev', 'ship'],
				enumDescriptions: [
					localize('quantumide.ai.agent.velocityProfile.dev', 'Fast exploration: batch search, parallel reads, compile checks after edits.'),
					localize('quantumide.ai.agent.velocityProfile.ship', 'Review-ready output: smaller diffs, verify script before claiming done.'),
				],
				scope: ConfigurationScope.APPLICATION,
				markdownDescription: localize('quantumide.ai.agent.velocityProfile', 'Agent Velocity profile controls system guidance and default verification behavior for the OpenAI-compatible agent.'),
			},
			[QuantumIDEAISettingId.AgentVelocityAttachWorkspaceContext]: {
				type: 'boolean',
				default: true,
				scope: ConfigurationScope.RESOURCE,
				markdownDescription: localize('quantumide.ai.agent.velocity.attachWorkspaceContext', 'Attaches QuantumIDE workspace intelligence (graph, diagnostics, SCM) on every agent turn.'),
			},
			[QuantumIDEAISettingId.AgentVelocityAttachRules]: {
				type: 'boolean',
				default: true,
				scope: ConfigurationScope.RESOURCE,
				markdownDescription: localize('quantumide.ai.agent.velocity.attachRules', 'Attaches `AGENTS.md` and `.quantumide/rules/*.md` as context on every agent turn.'),
			},
			[QuantumIDEAISettingId.AgentVelocityParallelHostTools]: {
				type: 'boolean',
				default: true,
				scope: ConfigurationScope.APPLICATION,
				markdownDescription: localize('quantumide.ai.agent.velocity.parallelHostTools', 'Runs consecutive read-only host tools (search, read, symbols) in parallel within a tool round.'),
			},
			[QuantumIDEAISettingId.AgentVelocityCrossRootSearch]: {
				type: 'boolean',
				default: true,
				scope: ConfigurationScope.RESOURCE,
				markdownDescription: localize('quantumide.ai.agent.velocity.crossRootSearch', 'When `.quantumide/workspace-links.json` is present, searches linked workspace roots in addition to the session working directory.'),
			},
			[QuantumIDEAISettingId.AgentVelocityHandoffEnabled]: {
				type: 'boolean',
				default: true,
				scope: ConfigurationScope.RESOURCE,
				markdownDescription: localize('quantumide.ai.agent.velocity.handoffEnabled', 'Writes `.quantumide/agent-handoff.md` after each completed turn and can resume from it via **QuantumIDE: Resume Agent Handoff**.'),
			},
			[QuantumIDEAISettingId.ChatSyncRealtime]: {
				type: 'boolean',
				default: false,
				scope: ConfigurationScope.APPLICATION,
				markdownDescription: localize('quantumide.chat.syncRealtime', 'Keeps the chat context orchestrator synchronized with editor, diagnostics, terminal, and SCM changes without manual refresh.'),
			},
			[QuantumIDEAISettingId.WorkspaceAutoRestoreSession]: {
				type: 'boolean',
				default: false,
				scope: ConfigurationScope.WINDOW,
				markdownDescription: localize('quantumide.workspace.autoRestoreSession', 'When enabled, QuantumIDE restores the last saved editor layout and open files from `.quantumide/workspace-state` after opening a workspace. Off by default to avoid freezing large workspaces on startup.'),
			},
			[QuantumIDEAISettingId.WorkspaceAutoSaveSession]: {
				type: 'boolean',
				default: false,
				scope: ConfigurationScope.WINDOW,
				markdownDescription: localize('quantumide.workspace.autoSaveSession', 'When enabled, QuantumIDE periodically saves editor layout and open files to `.quantumide/workspace-state`. Off by default; use **QuantumIDE: Save Workspace Session** for manual saves.'),
			},
			[QuantumIDEAISettingId.ChatDefaultMode]: {
				type: 'string',
				default: 'agent',
				enum: ['ask', 'edit', 'agent', 'refactor', 'review', 'terminal', 'planning'],
				scope: ConfigurationScope.APPLICATION,
				markdownDescription: localize('quantumide.chat.defaultMode', 'Default chat mode when opening a new QuantumIDE chat session.'),
			},
			[QuantumIDEAISettingId.ChatInlineEnabled]: {
				type: 'boolean',
				default: true,
				scope: ConfigurationScope.APPLICATION,
				markdownDescription: localize('quantumide.chat.inline.enabled', 'Enables inline editor AI commands (explain, optimize, rewrite, tests, docs).'),
			},
			[QuantumIDEAISettingId.ChatInlineGhostText]: {
				type: 'boolean',
				default: false,
				scope: ConfigurationScope.APPLICATION,
				markdownDescription: localize('quantumide.chat.inline.ghostText', 'Shows a ghost-text preview of the first proposed hunk line while reviewing inline diffs.'),
			},
			[QuantumIDEAISettingId.ChatDiffPartialHunks]: {
				type: 'boolean',
				default: true,
				scope: ConfigurationScope.APPLICATION,
				markdownDescription: localize('quantumide.chat.diff.partialHunks', 'When approving propose_file_edit, apply REPLACE/WITH patch hunks instead of replacing the entire file when markers are present.'),
			},
			[QuantumIDEAISettingId.ChatDiffSideBySide]: {
				type: 'boolean',
				default: true,
				scope: ConfigurationScope.APPLICATION,
				markdownDescription: localize('quantumide.chat.diff.sideBySide', 'Prefer side-by-side diff presentation for AI-proposed edits when supported.'),
			},
			[QuantumIDEAISettingId.ChatCursorParityEnabled]: {
				type: 'boolean',
				default: true,
				scope: ConfigurationScope.APPLICATION,
				markdownDescription: localize('quantumide.chat.cursorParity.enabled', 'Enables Cursor-style chat tools: direct editor edits, command palette, live preview, visual diff, and collaboration.'),
			},
			[QuantumIDEAISettingId.ChatCollabEnabled]: {
				type: 'boolean',
				default: true,
				scope: ConfigurationScope.APPLICATION,
				markdownDescription: localize('quantumide.chat.collab.enabled', 'Enables shared collaboration sessions under .quantumide/collab/ in the workspace.'),
			},
			[QuantumIDEAISettingId.ChatCollabExperimental]: {
				type: 'boolean',
				default: false,
				scope: ConfigurationScope.APPLICATION,
				markdownDescription: localize('quantumide.chat.collab.experimental', 'Enables experimental collaboration commands (local session export and optional WebSocket relay). No CRDT/OT shared editing.'),
			},
			[QuantumIDEAISettingId.CollabExperimentalAcknowledged]: {
				type: 'boolean',
				default: false,
				scope: ConfigurationScope.APPLICATION,
				markdownDescription: localize('quantumide.collab.experimentalAcknowledged', 'Set when you dismiss the one-time experimental collaboration notice.'),
			},
			[QuantumIDEAISettingId.ChatAttachmentsEnabled]: {
				type: 'boolean',
				default: true,
				scope: ConfigurationScope.APPLICATION,
				markdownDescription: localize('quantumide.chat.attachments.enabled', 'Enables drag-and-drop and file attachments in the chat panel (uses built-in chat attachment UI).'),
			},
			[QuantumIDEAISettingId.ChatFeatureParityEnabled]: {
				type: 'boolean',
				default: true,
				scope: ConfigurationScope.APPLICATION,
				markdownDescription: localize('quantumide.chat.featureParity.enabled', 'Enables full Cursor chat parity: manifests, file tree, tests, search previews, onboarding, and chat-staged edits.'),
			},
			[QuantumIDEAISettingId.ChatTokenBudget]: {
				type: 'number',
				default: 14_000,
				minimum: 2000,
				maximum: 48_000,
				scope: ConfigurationScope.RESOURCE,
				markdownDescription: localize('quantumide.chat.tokenBudget', 'Maximum characters of automatic workspace context attached per agent turn.'),
			},
			[QuantumIDEAISettingId.AgentMaxEditScope]: {
				type: 'number',
				default: 40,
				minimum: 1,
				maximum: 200,
				scope: ConfigurationScope.RESOURCE,
				markdownDescription: localize('quantumide.agent.maxEditScope', 'Maximum number of file operations allowed in a single apply_workspace_edits call.'),
			},
			[QuantumIDEAISettingId.AgentRetryOnError]: {
				type: 'boolean',
				default: true,
				scope: ConfigurationScope.APPLICATION,
				markdownDescription: localize('quantumide.agent.retryOnError', 'Allows the agent to retry failed verification steps when errors are recoverable.'),
			},
			[QuantumIDEAISettingId.AgentRefactorAutoVerify]: {
				type: 'boolean',
				default: true,
				scope: ConfigurationScope.APPLICATION,
				markdownDescription: localize('quantumide.agent.refactorAutoVerify', 'Runs compile check automatically after successful refactor host tools (§2.9).'),
			},
			[QuantumIDEAISettingId.AgentPreferLspRename]: {
				type: 'boolean',
				default: true,
				scope: ConfigurationScope.APPLICATION,
				markdownDescription: localize('quantumide.agent.preferLspRename', 'Prefer workspace LSP rename (client rename tool) over single-file rename_symbol for cross-file symbol changes.'),
			},
			[QuantumIDEAISettingId.AgentInstantPaletteCommands]: {
				type: 'boolean',
				default: false,
				scope: ConfigurationScope.APPLICATION,
				markdownDescription: localize('quantumide.agent.instantPalette', 'When enabled (`instantPaletteCommands`), safe palette actions (format, lint, test, merge navigation) run without extra agent confirmation. Destructive git/dependency commands still require confirmation.'),
			},
			[QuantumIDEAISettingId.AgentVerifyOnEdit]: {
				type: 'string',
				default: 'defer',
				enum: ['always', 'defer', 'never'],
				enumDescriptions: [
					localize('quantumide.agent.verifyOnEdit.always', 'Run compile/lint/test checks after substantive agent edits.'),
					localize('quantumide.agent.verifyOnEdit.defer', 'Queue verification for manual run (QuantumIDE: Run Deferred Agent Verification).'),
					localize('quantumide.agent.verifyOnEdit.never', 'Skip automatic verification unless the user requests it.'),
				],
				scope: ConfigurationScope.APPLICATION,
				description: localize('quantumide.agent.verifyOnEdit.description', 'Verify on edit — automatic compile/lint/test after agent file changes (always, defer, or never).'),
				markdownDescription: localize('quantumide.agent.verifyOnEdit', 'Controls automatic verification after agent file edits. Use **defer** or **never** for fast documentation edits; **always** runs `npm run compile` after code changes.'),
			},
			[QuantumIDEAISettingId.AgentPreferDirectEditorEdits]: {
				type: 'boolean',
				default: true,
				scope: ConfigurationScope.APPLICATION,
				markdownDescription: localize('quantumide.agent.preferDirectEditor', 'Prefer inline editor / manipulate_editor tools for small single-file changes below the line threshold.'),
			},
			[QuantumIDEAISettingId.AgentDirectEditorMaxLines]: {
				type: 'number',
				default: 100,
				minimum: 1,
				maximum: 500,
				scope: ConfigurationScope.APPLICATION,
				markdownDescription: localize('quantumide.agent.directEditorMaxLines', 'Maximum changed lines for preferring direct editor tools over full-file apply_workspace_edits.'),
			},
			[QuantumIDEAISettingId.AgentFastApplyEdits]: {
				type: 'boolean',
				default: true,
				scope: ConfigurationScope.APPLICATION,
				markdownDescription: localize('quantumide.agent.fastApply', 'Legacy toggle; prefer **Edit velocity**. When true without editVelocity, maps to fast mode.'),
			},
			[QuantumIDEAISettingId.AgentEditVelocity]: {
				type: 'string',
				default: 'maximum',
				enum: ['safe', 'fast', 'maximum'],
				enumDescriptions: [
					localize('quantumide.agent.editVelocity.safe', 'Full validation, checkpoints, read-before-write, formatting preservation.'),
					localize('quantumide.agent.editVelocity.fast', 'Skip validation and checkpoints; skip read-before-write on full-file writes.'),
					localize('quantumide.agent.editVelocity.maximum', 'Fastest: direct writeFile, compact agent prompt, no compile for docs; auto-used for docs/*.html and docs/*.md.'),
				],
				scope: ConfigurationScope.APPLICATION,
				description: localize('quantumide.agent.editVelocity.description', 'Edit velocity — how fast agent writes hit disk (safe, fast, or maximum).'),
				markdownDescription: localize('quantumide.agent.editVelocity', 'Controls how quickly agent file edits are written to disk. **maximum** is recommended for user-guide and docs work.'),
			},
			[QuantumIDEAISettingId.AgentWaitForIndexingBeforeEdits]: {
				type: 'boolean',
				default: false,
				scope: ConfigurationScope.APPLICATION,
				markdownDescription: localize('quantumide.agent.waitIndexing', 'When semantic indexing is enabled, block apply_workspace_edits until `.quantumide/indexing-status.json` reports ready.'),
			},
			[QuantumIDEAISettingId.AgentEditorContextSnapshot]: {
				type: 'boolean',
				default: true,
				scope: ConfigurationScope.APPLICATION,
				markdownDescription: localize('quantumide.agent.editorSnapshot', 'Persist live editor context to .quantumide/agent-context.json and inject into agent system prompts.'),
			},
			[QuantumIDEAISettingId.AgentTaskPhaseStatusEnabled]: {
				type: 'boolean',
				default: true,
				scope: ConfigurationScope.APPLICATION,
				markdownDescription: localize('quantumide.agent.taskPhase.enabled', 'Show real-time agent task phase status in the editor status bar (Reading, Planning, Searching, etc.).'),
			},
			[QuantumIDEAISettingId.AgentTaskPhaseStatusDismissMs]: {
				type: 'number',
				default: 3000,
				minimum: 500,
				maximum: 30000,
				scope: ConfigurationScope.APPLICATION,
				markdownDescription: localize('quantumide.agent.taskPhase.dismiss', 'Milliseconds before completed/error status clears from the status bar.'),
			},
			[QuantumIDEAISettingId.AgentTaskPhaseStatusLocation]: {
				type: 'string',
				default: 'statusBar',
				enum: ['statusBar', 'hidden'],
				scope: ConfigurationScope.APPLICATION,
				markdownDescription: localize('quantumide.agent.taskPhase.location', 'Where to show agent task phase status (status bar or hidden).'),
			},
			[QuantumIDEAISettingId.AgentDangerousCommandBlock]: {
				type: 'boolean',
				default: true,
				scope: ConfigurationScope.RESOURCE,
				markdownDescription: localize('quantumide.agent.dangerousCommandBlock', 'Blocks obviously dangerous terminal command proposals (for example recursive delete and privilege escalation).'),
			},
			[QuantumIDEAISettingId.IndexingReindexOnDemand]: {
				type: 'boolean',
				default: true,
				scope: ConfigurationScope.RESOURCE,
				markdownDescription: localize('quantumide.indexing.reindexOnDemand', 'Allows manual workspace reindex commands from the command palette.'),
			},
			[QuantumIDEAISettingId.IndexingEmbeddingProvider]: {
				type: 'string',
				default: 'local',
				enum: ['local', 'disabled', 'openai'],
				scope: ConfigurationScope.APPLICATION,
				markdownDescription: localize('quantumide.indexing.embeddingProvider', 'Selects the embedding provider used when semantic indexing is enabled.'),
			},
			[QuantumIDEAISettingId.IndexingScaleProfile]: {
				type: 'string',
				default: 'standard',
				enum: ['standard', 'enterprise'],
				scope: ConfigurationScope.RESOURCE,
				markdownDescription: localize('quantumide.indexing.scaleProfile', 'Standard caps indexing at ~500 files. Enterprise raises limits (up to 50k files) and uses chunked background scanning.'),
			},
			[QuantumIDEAISettingId.IndexingVectorStore]: {
				type: 'string',
				default: 'incremental',
				enum: ['json', 'incremental', 'lancedb'],
				scope: ConfigurationScope.RESOURCE,
				markdownDescription: localize('quantumide.indexing.vectorStore', 'Vector index storage: monolithic JSON, chunked incremental store, or LanceDB (agent-host search when @lancedb/lancedb is installed).'),
			},
			[QuantumIDEAISettingId.PrivacyLocalIndexingOnly]: {
				type: 'boolean',
				default: true,
				scope: ConfigurationScope.APPLICATION,
				markdownDescription: localize('quantumide.privacy.localIndexingOnly', 'Keeps repository indexing local to the machine by default.'),
			},
			[QuantumIDEAISettingId.PrivacyTelemetryOptIn]: {
				type: 'boolean',
				default: false,
				scope: ConfigurationScope.APPLICATION,
				markdownDescription: localize('quantumide.privacy.telemetryOptIn', 'Opt-in flag for QuantumIDE-specific AI telemetry beyond core VS Code telemetry settings.'),
			},
			[QuantumIDEAISettingId.PrivacyEncryptIndexCache]: {
				type: 'boolean',
				default: false,
				scope: ConfigurationScope.RESOURCE,
				markdownDescription: localize('quantumide.privacy.encryptIndexCache', 'Encrypt `.quantumide` index cache files at rest on disk (§5.2).'),
			},
			[QuantumIDEAISettingId.PerformanceEnforceBudgets]: {
				type: 'boolean',
				default: false,
				scope: ConfigurationScope.APPLICATION,
				markdownDescription: localize('quantumide.performance.enforceBudgets', 'Throw errors when §6 performance budgets are exceeded instead of only logging warnings.'),
			},
			[QuantumIDEAISettingId.TerminalAutoApproveSafe]: {
				type: 'boolean',
				default: false,
				scope: ConfigurationScope.RESOURCE,
				markdownDescription: localize('quantumide.terminal.autoApproveSafe', 'Auto-approves a small set of read-only terminal commands when terminal confirmation is enabled.'),
			},
			[QuantumIDEAISettingId.ModelFallbackRoute]: {
				type: 'string',
				default: 'openai.gpt-4.1-mini',
				scope: ConfigurationScope.APPLICATION,
				markdownDescription: localize('quantumide.ai.modelRouter.fallbackRoute', 'Route ID used when the selected model is unavailable or task routing does not match.'),
			},
			[QuantumIDEAISettingId.ModelTaskRoutes]: {
				type: 'object',
				default: {
					chat: 'openai.gpt-4.1',
					agent: 'openai.gpt-4.1',
					inline: 'openai.gpt-4.1-mini',
					review: 'openai.gpt-4.1',
					indexing: 'openai.gpt-4.1-mini',
				},
				scope: ConfigurationScope.APPLICATION,
				markdownDescription: localize('quantumide.ai.modelRouter.taskRoutes', 'Maps task kinds (chat, agent, inline, review, indexing) to model route IDs.'),
			},
			[QuantumIDEAISettingId.AgentAutoApplyThreshold]: {
				type: 'number',
				default: 0.85,
				minimum: 0,
				maximum: 1,
				scope: ConfigurationScope.APPLICATION,
				markdownDescription: localize('quantumide.agent.autoApplyThreshold', 'Confidence threshold for auto-applying coordinated edits when auto-apply is enabled (0–1).'),
			},
			[QuantumIDEAISettingId.IndexingMaxCacheMb]: {
				type: 'number',
				default: 256,
				minimum: 32,
				maximum: 4096,
				scope: ConfigurationScope.RESOURCE,
				markdownDescription: localize('quantumide.indexing.maxCacheMb', 'Soft limit for combined `.quantumide` index cache size (MB). Reindex if exceeded.'),
			},
			[QuantumIDEAISettingId.IndexingMaxFiles]: {
				type: 'number',
				default: 500,
				minimum: 50,
				maximum: 50_000,
				scope: ConfigurationScope.RESOURCE,
				markdownDescription: localize('quantumide.indexing.maxFiles', 'Maximum source files scanned per index refresh (§2.3 scale control).'),
			},
			[QuantumIDEAISettingId.IndexingMaxFileChars]: {
				type: 'number',
				default: 48_000,
				minimum: 4000,
				maximum: 512_000,
				scope: ConfigurationScope.RESOURCE,
				markdownDescription: localize('quantumide.indexing.maxFileChars', 'Maximum characters read per file during indexing.'),
			},
		},
	});
}

function openAgentSessions(accessor: ServicesAccessor): Promise<unknown> {
	return accessor.get(ICommandService).executeCommand(OPEN_AGENT_SESSIONS_WELCOME_COMMAND_ID);
}

async function openQuantumIDEOpenAIChat(accessor: ServicesAccessor): Promise<unknown> {
	try {
		return await accessor.get(ICommandService).executeCommand(OPEN_QUANTUMIDE_OPENAI_SESSION_COMMAND_ID, 'sidebar');
	} catch {
		return openAgentSessions(accessor);
	}
}

async function openQuantumIDEModelsSettings(accessor: ServicesAccessor): Promise<void> {
	const preferencesService = accessor.get(IPreferencesService);
	const config = accessor.get(IConfigurationService);
	const secretStorageService = accessor.get(ISecretStorageService);
	const agentHostService = accessor.get(IAgentHostService);
	const quickInputService = accessor.get(IQuickInputService);
	const commandService = accessor.get(ICommandService);

	await preferencesService.openSettings({ jsonEditor: false, query: QUANTUMIDE_SETTINGS_QUERIES.models });
	const secret = await secretStorageService.get(QuantumIDEOpenAIApiKeySecretStorageKey);
	const provider = config.getValue<string>(QuantumIDEAISettingId.DefaultProvider) ?? QuantumIDEAIProvider.Auto;
	const model = config.getValue<string>(QuantumIDEAISettingId.OpenAIModel) ?? 'gpt-4.1';
	const baseUrl = config.getValue<string>(QuantumIDEAISettingId.OpenAIBaseUrl) ?? 'https://api.openai.com/v1';
	const storageMode = config.getValue<string>(QuantumIDEAISettingId.OpenAIApiKeyStorage) ?? 'environment';
	const rootState = agentHostService.rootState.value;
	const openAIResource = rootState instanceof Error
		? undefined
		: rootState?.agents.find(agent => agent.provider === 'openai')?.protectedResources?.find(resource => resource.resource === QuantumIDEOpenAIProtectedResourceId);
	const hasEnvironmentKey = openAIResource?.required === false;
	const keyStatus = hasEnvironmentKey ? localize('quantumide.ai.modelsSettings.key.environment', 'environment key detected') : secret ? localize('quantumide.ai.modelsSettings.key.secret', 'stored in Secret Storage') : localize('quantumide.ai.modelsSettings.key.missing', 'not configured');

	const selected = await quickInputService.pick([
		{
			id: 'store-key',
			label: localize('quantumide.ai.modelsSettings.storeKey', 'Store API Key for Selected OpenAI Model'),
			detail: localize('quantumide.ai.modelsSettings.storeKey.detail', 'Securely stores the API key used by {0}. The key is never written to settings.json.', model),
		},
		{
			id: 'test-connection',
			label: localize('quantumide.ai.modelsSettings.testConnection', 'Test Selected Model API Access'),
			detail: localize('quantumide.ai.modelsSettings.testConnection.detail', 'Validates the stored key and endpoint before using chat.'),
		},
		{
			id: 'refresh-models',
			label: localize('quantumide.ai.modelsSettings.refreshModels', 'Refresh Available Models'),
			detail: localize('quantumide.ai.modelsSettings.refreshModels.detail', 'Fetches the model catalog from the configured OpenAI-compatible endpoint.'),
		},
		{
			id: 'clear-key',
			label: localize('quantumide.ai.modelsSettings.clearKey', 'Clear Stored API Key'),
			detail: localize('quantumide.ai.modelsSettings.clearKey.detail', 'Removes the OpenAI API key from QuantumIDE Secret Storage.'),
		},
		{
			id: 'settings-only',
			label: localize('quantumide.ai.modelsSettings.settingsOnly', 'Continue Editing Model Settings'),
			detail: localize('quantumide.ai.modelsSettings.settingsOnly.detail', 'Stay on the Models settings page to change model, endpoint, toggles, or routes.'),
		},
	], {
		title: localize('quantumide.ai.modelsSettings.title', 'QuantumIDE Models and API Access'),
		placeHolder: localize('quantumide.ai.modelsSettings.placeholder', 'Provider: {0} | Model: {1} | API key: {2} | Base URL: {3} | Storage: {4}', provider, model, keyStatus, baseUrl, storageMode),
	});

	if (selected?.id === 'store-key') {
		await commandService.executeCommand(QuantumIDEAICommandId.StoreOpenAIApiKey);
	} else if (selected?.id === 'test-connection') {
		await commandService.executeCommand(QuantumIDEAICommandId.TestOpenAIConnection);
	} else if (selected?.id === 'refresh-models') {
		await commandService.executeCommand(QuantumIDEAICommandId.RefreshOpenAIModels);
	} else if (selected?.id === 'clear-key') {
		await commandService.executeCommand(QuantumIDEAICommandId.ClearOpenAIApiKey);
	}
}

function isQuantumIDEProduct(): boolean {
	const names = [product.nameShort, product.nameLong, product.applicationName].filter((name): name is string => typeof name === 'string');
	return names.some(name => name.toLowerCase().includes('quantumide'));
}

function getActiveEditorContext(accessor: ServicesAccessor): { resource: string; languageId: string; selectedText?: string; fullTextExcerpt?: string } | undefined {
	const editor = accessor.get(ICodeEditorService).getActiveCodeEditor() ?? accessor.get(ICodeEditorService).getFocusedCodeEditor();
	const model = editor?.getModel();
	if (!editor || !model) {
		return undefined;
	}

	const selection = editor.getSelection();
	const selectedText = selection && !selection.isEmpty() ? model.getValueInRange(selection) : undefined;
	const fullText = model.getValue();
	return {
		resource: model.uri.toString(),
		languageId: model.getLanguageId(),
		selectedText: selectedText?.slice(0, MAX_CONTEXT_CHARS_PER_FILE),
		fullTextExcerpt: selectedText ? undefined : fullText.slice(0, MAX_CONTEXT_CHARS_PER_FILE),
	};
}

function buildWorkspaceContext(accessor: ServicesAccessor): string {
	const workspace = accessor.get(IWorkspaceContextService).getWorkspace();
	const folders = workspace.folders.map(folder => `- ${folder.name}: ${folder.uri.toString()}`);
	return folders.length > 0 ? folders.join('\n') : '- No workspace folder is currently open.';
}

function getSeverityLabel(severity: MarkerSeverity): string {
	switch (severity) {
		case MarkerSeverity.Error:
			return 'Error';
		case MarkerSeverity.Warning:
			return 'Warning';
		case MarkerSeverity.Info:
			return 'Info';
		case MarkerSeverity.Hint:
			return 'Hint';
		default:
			return 'Unknown';
	}
}

function buildDiagnosticsContext(accessor: ServicesAccessor, active: { resource: string } | undefined): string {
	if (!active) {
		return '- No active editor diagnostics are available.';
	}
	const resource = getActiveEditorContext(accessor);
	const uri = resource ? accessor.get(ICodeEditorService).getActiveCodeEditor()?.getModel()?.uri : undefined;
	if (!uri) {
		return '- No active editor diagnostics are available.';
	}
	const markers = accessor.get(IMarkerService).read({ resource: uri })
		.sort((left, right) => MarkerSeverity.compare(left.severity, right.severity))
		.slice(0, MAX_DIAGNOSTICS);
	if (markers.length === 0) {
		return '- No diagnostics reported for the active editor.';
	}
	return markers.map(marker => `- ${getSeverityLabel(marker.severity)} ${marker.startLineNumber}:${marker.startColumn} ${marker.source ? `[${marker.source}] ` : ''}${marker.message}`).join('\n');
}

async function readTextExcerpt(accessor: ServicesAccessor, resource: import('../../base/common/uri.js').URI | undefined): Promise<string | undefined> {
	if (!resource) {
		return undefined;
	}
	let reference;
	try {
		reference = await accessor.get(ITextModelService).createModelReference(resource);
		return reference.object.textEditorModel.getValue().slice(0, MAX_DIFF_CHARS_PER_FILE);
	} catch {
		return undefined;
	} finally {
		reference?.dispose();
	}
}

async function buildSCMChangesContext(accessor: ServicesAccessor): Promise<string> {
	const scmService = accessor.get(ISCMService);
	const lines: string[] = [];
	let count = 0;
	let snippets = 0;
	for (const repository of scmService.repositories) {
		const root = repository.provider.rootUri?.toString() ?? repository.provider.label;
		lines.push(`Repository: ${root}`);
		for (const group of repository.provider.groups) {
			if (group.resources.length === 0) {
				continue;
			}
			lines.push(`  ${group.label}:`);
			for (const resource of group.resources) {
				if (count >= MAX_SCM_RESOURCES) {
					lines.push(`  - ...additional changed resources omitted after ${MAX_SCM_RESOURCES} entries.`);
					return lines.join('\n');
				}
				const status = resource.decorations.tooltip ?? resource.contextValue ?? 'changed';
				lines.push(`  - ${resource.sourceUri.toString()} (${status})`);
				if (snippets < MAX_DIFF_SNIPPETS) {
					const originalResource = resource.multiDiffEditorOriginalUri ?? await repository.provider.getOriginalResource(resource.sourceUri);
					const modifiedResource = resource.multiDiffEditorModifiedUri ?? resource.sourceUri;
					const [original, modified] = await Promise.all([
						readTextExcerpt(accessor, originalResource ?? undefined),
						readTextExcerpt(accessor, modifiedResource),
					]);
					if (original !== undefined || modified !== undefined) {
						lines.push('    Diff context excerpt:');
						if (original !== undefined) {
							lines.push('    Original:', indentBlock(original, '      '));
						}
						if (modified !== undefined) {
							lines.push('    Modified:', indentBlock(modified, '      '));
						}
						snippets++;
					}
				}
				count++;
			}
		}
	}
	return lines.length > 0 ? lines.join('\n') : '- No source-control changes are currently reported.';
}

function indentBlock(value: string, prefix: string): string {
	return value.split(/\r?\n/).map(line => `${prefix}${line}`).join('\n');
}

function openQuickChatWithPrompt(accessor: ServicesAccessor, prompt: string): void {
	accessor.get(IQuickChatService).open({ query: prompt, isPartialQuery: true });
}

function recordQuantumIDEAIAuditEvent(accessor: ServicesAccessor, type: string, summary: string, metadata: Record<string, unknown> = {}): void {
	recordQuantumIDEAIAuditEventWithServices(accessor.get(IConfigurationService), accessor.get(IStorageService), type, summary, metadata);
}

function recordQuantumIDEAIAuditEventWithServices(configurationService: IConfigurationService, storage: IStorageService, type: string, summary: string, metadata: Record<string, unknown> = {}): void {
	if (configurationService.getValue<boolean>(QuantumIDEAISettingId.AgentAuditEnabled) === false) {
		return;
	}
	let existing: unknown[] = [];
	const raw = storage.get(QUANTUMIDE_AI_AUDIT_STORAGE_KEY, StorageScope.APPLICATION);
	if (raw) {
		try {
			const parsed = JSON.parse(raw);
			if (Array.isArray(parsed)) {
				existing = parsed;
			}
		} catch {
			existing = [];
		}
	}
	const event = {
		type,
		summary,
		metadata,
		timestamp: new Date().toISOString(),
	};
	storage.store(QUANTUMIDE_AI_AUDIT_STORAGE_KEY, JSON.stringify([event, ...existing].slice(0, 50)), StorageScope.APPLICATION, StorageTarget.MACHINE);
}

function truncateAuditValue(value: string, maxLength = 160): string {
	return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function validateOpenAIApiKeyInput(value: string): string | undefined {
	const trimmed = value.trim();
	if (!trimmed) {
		return localize('quantumide.ai.openai.storeApiKey.required', 'Enter an API key or press Escape to cancel.');
	}
	if (/\s/.test(trimmed)) {
		return localize('quantumide.ai.openai.storeApiKey.noWhitespace', 'API keys cannot contain spaces or newlines.');
	}
	if (trimmed.length < 20) {
		return localize('quantumide.ai.openai.storeApiKey.tooShort', 'This key looks too short for an OpenAI-compatible API key.');
	}
	return undefined;
}

async function authenticateStoredOpenAIApiKey(accessor: ServicesAccessor, successMessage: string): Promise<boolean> {
	const secretStorage = accessor.get(ISecretStorageService);
	const notificationService = accessor.get(INotificationService);
	const agentHostService = accessor.get(IAgentHostService);
	const secret = await secretStorage.get(QuantumIDEOpenAIApiKeySecretStorageKey);
	if (!secret) {
		notificationService.warn(localize('quantumide.ai.openai.noStoredApiKey', 'No OpenAI API key is stored. Run QuantumIDE: Store OpenAI API Key first, or configure QUANTUMIDE_OPENAI_API_KEY before launching QuantumIDE.'));
		return false;
	}
	notificationService.info(localize('quantumide.ai.openai.authenticating', 'Testing OpenAI connection and refreshing available models...'));
	try {
		const result = await agentHostService.authenticate({ resource: QuantumIDEOpenAIProtectedResourceId, token: secret });
		if (!result.authenticated) {
			notificationService.error(localize('quantumide.ai.openai.authenticateRejected', 'OpenAI connection failed. Check the stored API key, base URL, quota, and model access.'));
			return false;
		}
		notificationService.info(successMessage);
		return true;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		notificationService.error(localize('quantumide.ai.openai.authenticateFailed', 'OpenAI connection failed: {0}', message));
		return false;
	}
}

async function storeOpenAIApiKey(accessor: ServicesAccessor): Promise<void> {
	const quickInputService = accessor.get(IQuickInputService);
	const secretStorageService = accessor.get(ISecretStorageService);
	const configurationService = accessor.get(IConfigurationService);
	const agentHostService = accessor.get(IAgentHostService);
	const notificationService = accessor.get(INotificationService);
	const storageService = accessor.get(IStorageService);

	const apiKey = await quickInputService.input({
		title: localize('quantumide.ai.openai.storeApiKey.title', 'Store QuantumIDE OpenAI API Key'),
		placeHolder: localize('quantumide.ai.openai.storeApiKey.placeholder', 'Enter an OpenAI-compatible API key'),
		password: true,
		ignoreFocusLost: true,
		prompt: localize('quantumide.ai.openai.storeApiKey.prompt', 'The key is stored in the application secret store, not in settings.json.'),
		validateInput: async value => validateOpenAIApiKeyInput(value),
	});
	if (!apiKey) {
		return;
	}
	await secretStorageService.set(QuantumIDEOpenAIApiKeySecretStorageKey, apiKey.trim());
	await configurationService.updateValue(QuantumIDEAISettingId.OpenAIApiKeyStorage, 'secretStorage');
	let forwarded = false;
	try {
		const result = await agentHostService.authenticate({ resource: QuantumIDEOpenAIProtectedResourceId, token: apiKey.trim() });
		forwarded = result.authenticated;
	} catch {
		forwarded = false;
	}
	recordQuantumIDEAIAuditEventWithServices(configurationService, storageService, 'openai-api-key-stored', 'Stored OpenAI API key in application secret storage.');
	notificationService.info(forwarded
		? localize('quantumide.ai.openai.storeApiKey.savedForwarded', 'OpenAI API key saved in QuantumIDE secret storage and forwarded to the Agent Host.')
		: localize('quantumide.ai.openai.storeApiKey.savedNotForwarded', 'OpenAI API key saved in QuantumIDE secret storage. Restart or enable Agent Host if it is not available yet.'));
}

async function testOpenAIConnection(accessor: ServicesAccessor): Promise<void> {
	const configurationService = accessor.get(IConfigurationService);
	const storageService = accessor.get(IStorageService);
	const authenticated = await authenticateStoredOpenAIApiKey(accessor, localize('quantumide.ai.openai.testConnection.success', 'OpenAI connection succeeded. QuantumIDE refreshed the available model catalog.'));
	if (authenticated) {
		recordQuantumIDEAIAuditEventWithServices(configurationService, storageService, 'openai-connection-tested', 'Tested OpenAI connection and refreshed model catalog.');
	}
}

async function refreshOpenAIModels(accessor: ServicesAccessor): Promise<void> {
	const configurationService = accessor.get(IConfigurationService);
	const storageService = accessor.get(IStorageService);
	const authenticated = await authenticateStoredOpenAIApiKey(accessor, localize('quantumide.ai.openai.refreshModels.success', 'OpenAI model catalog refreshed.'));
	if (authenticated) {
		recordQuantumIDEAIAuditEventWithServices(configurationService, storageService, 'openai-models-refreshed', 'Refreshed OpenAI model catalog.');
	}
}

async function clearOpenAIApiKey(accessor: ServicesAccessor): Promise<void> {
	const secretStorageService = accessor.get(ISecretStorageService);
	const agentHostService = accessor.get(IAgentHostService);
	const configurationService = accessor.get(IConfigurationService);
	const storageService = accessor.get(IStorageService);
	const notificationService = accessor.get(INotificationService);
	await secretStorageService.delete(QuantumIDEOpenAIApiKeySecretStorageKey);
	try {
		await agentHostService.authenticate({ resource: QuantumIDEOpenAIProtectedResourceId, token: '' });
	} catch {
		// Agent Host may not be running; clearing secret storage is still complete.
	}
	recordQuantumIDEAIAuditEventWithServices(configurationService, storageService, 'openai-api-key-cleared', 'Cleared OpenAI API key from application secret storage.');
	notificationService.info(localize('quantumide.ai.openai.clearApiKey.cleared', 'OpenAI API key removed from QuantumIDE secret storage.'));
}

async function showProviderStatus(accessor: ServicesAccessor): Promise<void> {
	const config = accessor.get(IConfigurationService);
	const secretStorageService = accessor.get(ISecretStorageService);
	const agentHostService = accessor.get(IAgentHostService);
	const quickInputService = accessor.get(IQuickInputService);
	const commandService = accessor.get(ICommandService);
	const storageService = accessor.get(IStorageService);
	const secret = await secretStorageService.get(QuantumIDEOpenAIApiKeySecretStorageKey);
	const defaultProvider = config.getValue<string>(QuantumIDEAISettingId.DefaultProvider) ?? QuantumIDEAIProvider.Auto;
	const storageMode = config.getValue<string>(QuantumIDEAISettingId.OpenAIApiKeyStorage) ?? 'environment';
	const model = config.getValue<string>(QuantumIDEAISettingId.OpenAIModel) ?? 'gpt-4.1';
	const baseUrl = config.getValue<string>(QuantumIDEAISettingId.OpenAIBaseUrl) ?? 'https://api.openai.com/v1';
	const rootState = agentHostService.rootState.value;
	const openAIResource = rootState instanceof Error
		? undefined
		: rootState?.agents.find(agent => agent.provider === 'openai')?.protectedResources?.find(resource => resource.resource === QuantumIDEOpenAIProtectedResourceId);
	const hasEnvironmentKey = openAIResource?.required === false;
	const hasSecretKey = !!secret;
	let agentHostAuthenticated = hasEnvironmentKey;
	if (secret) {
		try {
			agentHostAuthenticated = (await agentHostService.authenticate({ resource: QuantumIDEOpenAIProtectedResourceId, token: secret })).authenticated;
		} catch {
			agentHostAuthenticated = false;
		}
	}
	const selected = await quickInputService.pick([
		{
			id: 'settings',
			label: localize('quantumide.ai.providerStatus.openSettings', 'Open AI Settings'),
			detail: localize('quantumide.ai.providerStatus.summary', 'Provider: {0} | OpenAI model: {1} | API key: {2} | Agent Host: {3}', defaultProvider, model, hasEnvironmentKey ? 'environment' : hasSecretKey ? 'secret storage' : 'not configured', agentHostAuthenticated ? 'authenticated' : 'not authenticated'),
		},
		{
			id: 'store-key',
			label: localize('quantumide.ai.providerStatus.storeKey', 'Store OpenAI API Key'),
			detail: localize('quantumide.ai.providerStatus.storeKey.detail', 'Save a key in the application secret store.'),
		},
		{
			id: 'test-connection',
			label: localize('quantumide.ai.providerStatus.testConnection', 'Test OpenAI Connection'),
			detail: localize('quantumide.ai.providerStatus.testConnection.detail', 'Validate the stored key and refresh OpenAI-compatible models.'),
		},
		{
			id: 'refresh-models',
			label: localize('quantumide.ai.providerStatus.refreshModels', 'Refresh OpenAI Models'),
			detail: localize('quantumide.ai.providerStatus.refreshModels.detail', 'Fetch the provider model catalog using the stored key.'),
		},
	], {
		title: localize('quantumide.ai.providerStatus.title', 'QuantumIDE AI Provider Status'),
		placeHolder: localize('quantumide.ai.providerStatus.placeholder', 'Base URL: {0} | Key storage setting: {1}', baseUrl, storageMode),
	});
	recordQuantumIDEAIAuditEventWithServices(config, storageService, 'provider-status-shown', 'Viewed QuantumIDE AI provider status.', { defaultProvider, model, storageMode, hasEnvironmentKey, hasSecretKey });
	if (selected?.id === 'settings') {
		await commandService.executeCommand(QuantumIDEAICommandId.OpenSettingsModels);
	} else if (selected?.id === 'store-key') {
		await commandService.executeCommand(QuantumIDEAICommandId.StoreOpenAIApiKey);
	} else if (selected?.id === 'test-connection') {
		await commandService.executeCommand(QuantumIDEAICommandId.TestOpenAIConnection);
	} else if (selected?.id === 'refresh-models') {
		await commandService.executeCommand(QuantumIDEAICommandId.RefreshOpenAIModels);
	}
}

async function applyProposedSelectionEditFromClipboard(accessor: ServicesAccessor): Promise<void> {
	const editor = accessor.get(ICodeEditorService).getActiveCodeEditor() ?? accessor.get(ICodeEditorService).getFocusedCodeEditor();
	const selection = editor?.getSelection();
	const model = editor?.getModel();
	if (!editor || !selection || selection.isEmpty() || !model) {
		accessor.get(INotificationService).info(localize('quantumide.ai.applySelection.noSelection', 'Select the code you want to replace before applying an AI edit proposal.'));
		return;
	}

	const proposedText = await accessor.get(IClipboardService).readText();
	if (!proposedText.trim()) {
		accessor.get(INotificationService).warn(localize('quantumide.ai.applySelection.emptyClipboard', 'Clipboard is empty. Copy the proposed replacement text before running this command.'));
		return;
	}

	const selectedText = model.getValueInRange(selection);
	const inlineDiff = accessor.get(IQuantumIDEInlineDiffService);
	inlineDiff.showProposal(model.uri, selection, selectedText, proposedText);
	const confirmation = await accessor.get(IQuickInputService).pick([
		{
			id: 'accept',
			label: localize('quantumide.ai.applySelection.accept', 'Accept Inline Diff'),
			detail: localize('quantumide.ai.applySelection.accept.detail', 'Apply the proposed replacement ({0} chars).', proposedText.length),
		},
		{
			id: 'reject',
			label: localize('quantumide.ai.applySelection.reject', 'Reject Inline Diff'),
		},
	], {
		title: localize('quantumide.ai.applySelection.confirm.title', 'Review Inline AI Diff'),
		placeHolder: localize('quantumide.ai.applySelection.confirm.placeholder', 'Accept or reject the inline diff preview.'),
	});
	if (confirmation?.id === 'reject') {
		inlineDiff.rejectProposal();
		return;
	}
	if (confirmation?.id !== 'accept') {
		inlineDiff.rejectProposal();
		return;
	}
	const applied = inlineDiff.acceptProposal();
	if (applied) {
		recordQuantumIDEAIAuditEvent(accessor, 'selection-edit-applied', 'Applied AI edit proposal from clipboard.', {
			resource: model.uri.toString(),
			selectedCharacters: selectedText.length,
			replacementCharacters: proposedText.length,
		});
		accessor.get(INotificationService).info(localize('quantumide.ai.applySelection.applied', 'Applied AI edit proposal to the current selection.'));
	} else {
		accessor.get(INotificationService).error(localize('quantumide.ai.applySelection.failed', 'QuantumIDE could not apply the proposed edit to the current selection.'));
	}
}

async function applyProposedFileEditsFromClipboard(accessor: ServicesAccessor): Promise<void> {
	const clipboard = await accessor.get(IClipboardService).readText();
	const edits = parseFileEditProposals(clipboard);
	if (edits.length === 0) {
		accessor.get(INotificationService).warn(localize('quantumide.ai.applyFileEdits.noEdits', 'Clipboard does not contain file edit proposals. Copy JSON like { "edits": [{ "path": "src/file.ts", "content": "..." }] }.'));
		return;
	}

	const workspace = accessor.get(IWorkspaceContextService).getWorkspace();
	const fileService = accessor.get(IFileService);
	const resolved = edits.map(edit => ({
		...edit,
		resource: resolveWorkspaceFile(workspace.folders[0]?.uri, edit.path),
	}));
	const workspaceRoot = workspace.folders[0]?.uri;
	await accessor.get(IQuantumIDEDiffReviewService).openProposedFileEdits(
		localize('quantumide.ai.applyFileEdits.multiDiffTitle', 'QuantumIDE Proposed File Edits'),
		resolved.map(edit => ({ path: edit.path, content: edit.content })),
		workspaceRoot,
	);

	const selected = await accessor.get(IQuickInputService).pick(resolved.map(edit => ({
		id: edit.resource.toString(),
		label: edit.path,
		description: localize('quantumide.ai.applyFileEdits.characters', '{0} characters', edit.content.length),
		detail: edit.resource.toString(),
		edit,
		picked: true,
	})), {
		canPickMany: true,
		title: localize('quantumide.ai.applyFileEdits.confirm.title', 'Apply QuantumIDE AI File Edit Proposals'),
		placeHolder: localize('quantumide.ai.applyFileEdits.confirm.placeholder', 'Review the opened proposal preview, then choose files to write.'),
	});
	if (!selected || selected.length === 0) {
		return;
	}

	for (const item of selected) {
		await fileService.writeFile(item.edit.resource, VSBuffer.fromString(item.edit.content));
	}
	recordQuantumIDEAIAuditEvent(accessor, 'file-edits-applied', 'Applied AI file edit proposals from clipboard.', {
		files: selected.map(item => item.edit.path),
		count: selected.length,
	});
	accessor.get(INotificationService).info(localize('quantumide.ai.applyFileEdits.applied', 'Applied {0} AI file edit proposal(s).', selected.length));
}

async function refreshWorkspaceAIIndex(accessor: ServicesAccessor): Promise<void> {
	const workspace = accessor.get(IWorkspaceContextService).getWorkspace();
	if (workspace.folders.length === 0) {
		accessor.get(INotificationService).info(localize('quantumide.ai.refreshIndex.noWorkspace', 'Open a workspace folder before refreshing the QuantumIDE AI index.'));
		return;
	}
	await accessor.get(IConfigurationService).updateValue(QuantumIDEAISettingId.IndexingEnabled, true);
	const graph = await accessor.get(IQuantumIDEWorkspaceContextService).refreshWorkspaceGraph('manual refresh');
	recordQuantumIDEAIAuditEvent(accessor, 'workspace-index-refreshed', 'Refreshed QuantumIDE workspace intelligence graph.', {
		files: graph.files.length,
		projects: graph.projects.length,
		manifests: graph.manifests.length,
	});
	accessor.get(INotificationService).info(localize('quantumide.ai.refreshIndex.done', 'QuantumIDE AI indexed {0} project(s), {1} manifest(s), and {2} file(s).', graph.projects.length, graph.manifests.length, graph.files.length));
	accessor.get(INotificationService).info(`QuantumIDE workspace graph: ${summarizeQuantumIDEWorkspaceGraph(graph)}`);
}

async function runProposedTerminalCommand(accessor: ServicesAccessor): Promise<void> {
	const command = await accessor.get(IQuickInputService).input({
		title: localize('quantumide.ai.runTerminal.title', 'Run Proposed Terminal Command'),
		placeHolder: localize('quantumide.ai.runTerminal.placeholder', 'Paste or type the command proposed by QuantumIDE AI'),
		ignoreFocusLost: true,
		validateInput: async value => value.trim().length === 0 ? localize('quantumide.ai.runTerminal.required', 'Enter a command or press Escape to cancel.') : undefined,
	});
	if (!command) {
		return;
	}

	const trimmedCommand = command.trim();
	const requireConfirmation = accessor.get(IConfigurationService).getValue<boolean>(QuantumIDEAISettingId.AgentRequireConfirmationForTerminal) !== false;
	if (requireConfirmation) {
		const confirmation = await accessor.get(IQuickInputService).pick([
			{
				id: 'run',
				label: localize('quantumide.ai.runTerminal.run', 'Run Command'),
				detail: trimmedCommand,
			},
			{
				id: 'cancel',
				label: localize('quantumide.ai.runTerminal.cancel', 'Cancel'),
			},
		], {
			title: localize('quantumide.ai.runTerminal.confirm.title', 'Confirm QuantumIDE AI Terminal Command'),
			placeHolder: localize('quantumide.ai.runTerminal.confirm.placeholder', 'Terminal commands can change files or system state. Review before running.'),
		});
		if (confirmation?.id !== 'run') {
			return;
		}
	}

	const terminalService = accessor.get(ITerminalService);
	if (!terminalService.isProcessSupportRegistered) {
		accessor.get(INotificationService).warn(localize('quantumide.ai.runTerminal.unsupported', 'Terminal process support is not available in this window.'));
		return;
	}
	const instance = terminalService.activeInstance ?? await terminalService.createTerminal({ location: TerminalLocation.Panel });
	if (!instance) {
		accessor.get(INotificationService).error(localize('quantumide.ai.runTerminal.createFailed', 'QuantumIDE could not create a terminal for the proposed command.'));
		return;
	}
	instance.sendText(trimmedCommand, true, true);
	recordQuantumIDEAIAuditEvent(accessor, 'terminal-command-run', 'Ran AI-proposed terminal command.', {
		commandPreview: truncateAuditValue(trimmedCommand),
		commandLength: trimmedCommand.length,
		confirmed: requireConfirmation,
	});
	await terminalService.revealActiveTerminal(true);
}

function parseFileEditProposals(value: string): IQuantumIDEAIFileEditProposal[] {
	const trimmed = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
	if (!trimmed) {
		return [];
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(trimmed);
	} catch {
		return [];
	}
	const candidates = Array.isArray(parsed)
		? parsed
		: typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as { edits?: unknown }).edits)
			? (parsed as { edits: unknown[] }).edits
			: [];
	return candidates.flatMap(item => {
		if (!item || typeof item !== 'object') {
			return [];
		}
		const candidate = item as { path?: unknown; content?: unknown; replacement?: unknown };
		const path = typeof candidate.path === 'string' ? candidate.path : undefined;
		const content = typeof candidate.content === 'string' ? candidate.content : typeof candidate.replacement === 'string' ? candidate.replacement : undefined;
		return path && content !== undefined ? [{ path, content }] : [];
	});
}

function resolveWorkspaceFile(root: URI | undefined, path: string): URI {
	if (/^[a-z][a-z0-9+.-]*:/i.test(path)) {
		return URI.parse(path);
	}
	if (isAbsolute(path)) {
		return URI.file(path);
	}
	return root ? joinPath(root, path) : URI.file(path);
}

async function buildAskWorkspacePrompt(accessor: ServicesAccessor): Promise<string> {
	const config = accessor.get(IConfigurationService);
	const maxContextFiles = config.getValue<number>(QuantumIDEAISettingId.AgentMaxContextFiles);
	const active = getActiveEditorContext(accessor);
	const workspaceContext = await accessor.get(IQuantumIDEWorkspaceContextService).buildWorkspaceContext({
		maxChars: 16_000,
		includeActiveEditor: true,
		includeDiagnostics: true,
		includeSCM: true,
	});
	const sections = [
		'You are QuantumIDE AI. Help me understand this workspace and answer my question.',
		'',
		workspaceContext,
		'',
		`Configured max automatic context files: ${maxContextFiles ?? 20}`,
	];

	if (active) {
		sections.push(
			'',
			'Active editor context:',
			`Resource: ${active.resource}`,
			`Language: ${active.languageId}`,
			'',
			'```',
			active.selectedText ?? active.fullTextExcerpt ?? '',
			'```',
		);
	}

	sections.push('', 'Question: ');
	return sections.join('\n');
}

function buildExplainSelectionPrompt(accessor: ServicesAccessor): string | undefined {
	const active = getActiveEditorContext(accessor);
	if (!active?.selectedText) {
		return undefined;
	}
	return [
		'You are QuantumIDE AI. Explain the selected code clearly and practically.',
		'',
		`Resource: ${active.resource}`,
		`Language: ${active.languageId}`,
		'',
		'Selected code:',
		'```',
		active.selectedText,
		'```',
		'',
		'Explain what it does, important control flow, dependencies, and any risks or improvement opportunities.',
	].join('\n');
}

function registerQuantumIDEAICommands(): void {
	registerAction2(class OpenQuantumIDESettingsAction extends Action2 {
		constructor() {
			super({
				id: QuantumIDEAICommandId.OpenSettings,
				title: localize2('quantumide.settings.open', 'QuantumIDE: Open Settings'),
				category: localize2('quantumide.settings.category', 'QuantumIDE Settings'),
				f1: true,
				icon: Codicon.settingsGear,
			});
		}
		run(accessor: ServicesAccessor): Promise<void> {
			return openQuantumIDESettingsPanel(accessor, 'general');
		}
	});

	registerAction2(class OpenQuantumIDEAISettingsAction extends Action2 {
		constructor() {
			super({
				id: QuantumIDEAICommandId.OpenAISettings,
				title: localize2('quantumide.ai.openSettings', 'QuantumIDE: Open AI Settings'),
				category: localize2('quantumide.ai.category', 'QuantumIDE AI'),
				f1: true,
				icon: Codicon.sparkle,
			});
		}
		run(accessor: ServicesAccessor): Promise<void> {
			return openQuantumIDESettingsPanel(accessor, 'models');
		}
	});

	registerAction2(class OpenQuantumIDESettingsAIAction extends Action2 {
		constructor() {
			super({
				id: QuantumIDEAICommandId.OpenSettingsAI,
				title: localize2('quantumide.settings.openAI', 'QuantumIDE: Open AI Settings'),
				category: localize2('quantumide.settings.category', 'QuantumIDE Settings'),
				f1: true,
				icon: Codicon.sparkle,
			});
		}
		run(accessor: ServicesAccessor): Promise<void> {
			return openQuantumIDESettingsPanel(accessor, 'models');
		}
	});

	registerAction2(class OpenQuantumIDESettingsModelsAction extends Action2 {
		constructor() {
			super({
				id: QuantumIDEAICommandId.OpenSettingsModels,
				title: localize2('quantumide.settings.openModels', 'QuantumIDE: Open Models Settings'),
				category: localize2('quantumide.settings.category', 'QuantumIDE Settings'),
				f1: true,
				icon: Codicon.serverProcess,
			});
		}
		run(accessor: ServicesAccessor): Promise<void> {
			return openQuantumIDEModelsSettings(accessor);
		}
	});

	registerAction2(class OpenQuantumIDESettingsWorkspaceAction extends Action2 {
		constructor() {
			super({
				id: QuantumIDEAICommandId.OpenSettingsWorkspace,
				title: localize2('quantumide.settings.openWorkspace', 'QuantumIDE: Open Workspace Settings'),
				category: localize2('quantumide.settings.category', 'QuantumIDE Settings'),
				f1: true,
				icon: Codicon.folderOpened,
			});
		}
		run(accessor: ServicesAccessor): Promise<void> {
			return openQuantumIDESettingsPanel(accessor, 'workspace');
		}
	});

	registerAction2(class OpenQuantumIDESettingsSecurityAction extends Action2 {
		constructor() {
			super({
				id: QuantumIDEAICommandId.OpenSettingsSecurity,
				title: localize2('quantumide.settings.openSecurity', 'QuantumIDE: Open Security Settings'),
				category: localize2('quantumide.settings.category', 'QuantumIDE Settings'),
				f1: true,
				icon: Codicon.shield,
			});
		}
		run(accessor: ServicesAccessor): Promise<void> {
			return openQuantumIDESettingsPanel(accessor, 'security');
		}
	});

	registerAction2(class StoreQuantumIDEOpenAIApiKeyAction extends Action2 {
		constructor() {
			super({
				id: QuantumIDEAICommandId.StoreOpenAIApiKey,
				title: localize2('quantumide.command.storeOpenAIApiKey', 'QuantumIDE: Store OpenAI API Key'),
				category: localize2('quantumide.ai.category', 'QuantumIDE AI'),
			});
		}
		run(accessor: ServicesAccessor): Promise<void> {
			return storeOpenAIApiKey(accessor);
		}
	});

	registerAction2(class TestQuantumIDEOpenAIConnectionAction extends Action2 {
		constructor() {
			super({
				id: QuantumIDEAICommandId.TestOpenAIConnection,
				title: localize2('quantumide.command.testOpenAIConnection', 'QuantumIDE: Test OpenAI Connection'),
				category: localize2('quantumide.ai.category', 'QuantumIDE AI'),
			});
		}
		run(accessor: ServicesAccessor): Promise<void> {
			return testOpenAIConnection(accessor);
		}
	});

	registerAction2(class RefreshQuantumIDEOpenAIModelsAction extends Action2 {
		constructor() {
			super({
				id: QuantumIDEAICommandId.RefreshOpenAIModels,
				title: localize2('quantumide.command.refreshOpenAIModels', 'QuantumIDE: Refresh OpenAI Models'),
				category: localize2('quantumide.ai.category', 'QuantumIDE AI'),
			});
		}
		run(accessor: ServicesAccessor): Promise<void> {
			return refreshOpenAIModels(accessor);
		}
	});

	registerAction2(class ShowQuantumIDEAIProviderStatusAction extends Action2 {
		constructor() {
			super({
				id: QuantumIDEAICommandId.ShowProviderStatus,
				title: localize2('quantumide.command.showProviderStatus', 'QuantumIDE: Show AI Provider Status'),
				category: localize2('quantumide.ai.category', 'QuantumIDE AI'),
			});
		}
		run(accessor: ServicesAccessor): Promise<void> {
			return showProviderStatus(accessor);
		}
	});

	registerAction2(class ClearQuantumIDEOpenAIApiKeyAction extends Action2 {
		constructor() {
			super({
				id: QuantumIDEAICommandId.ClearOpenAIApiKey,
				title: localize2('quantumide.command.clearOpenAIApiKey', 'QuantumIDE: Clear Stored OpenAI API Key'),
				category: localize2('quantumide.ai.category', 'QuantumIDE AI'),
			});
		}
		run(accessor: ServicesAccessor): Promise<void> {
			return clearOpenAIApiKey(accessor);
		}
	});

	registerAction2(class QuantumIDENewAgentChatAction extends Action2 {
		constructor() {
			super({
				id: QuantumIDEAICommandId.NewAgentChat,
				title: localize2('quantumide.command.newAgentChat', 'QuantumIDE: New Agent Chat'),
				category: localize2('quantumide.ai.category', 'QuantumIDE AI'),
			});
		}
		run(accessor: ServicesAccessor): Promise<unknown> {
			return openQuantumIDEOpenAIChat(accessor);
		}
	});

	registerAction2(class QuantumIDEAskAboutWorkspaceAction extends Action2 {
		constructor() {
			super({
				id: QuantumIDEAICommandId.AskAboutWorkspace,
				title: localize2('quantumide.command.askAboutWorkspace', 'QuantumIDE: Ask About Workspace'),
				category: localize2('quantumide.ai.category', 'QuantumIDE AI'),
			});
		}
		async run(accessor: ServicesAccessor): Promise<void> {
			openQuickChatWithPrompt(accessor, await buildAskWorkspacePrompt(accessor));
		}
	});

	registerAction2(class QuantumIDEExplainSelectionAction extends Action2 {
		constructor() {
			super({
				id: QuantumIDEAICommandId.ExplainSelection,
				title: localize2('quantumide.command.explainSelection', 'QuantumIDE: Explain Selection'),
				category: localize2('quantumide.ai.category', 'QuantumIDE AI'),
			});
		}
		run(accessor: ServicesAccessor): void {
			const prompt = buildExplainSelectionPrompt(accessor);
			if (!prompt) {
				accessor.get(INotificationService).info(localize('quantumide.ai.explainSelection.noSelection', 'Select code in an editor before running QuantumIDE: Explain Selection.'));
				return;
			}
			openQuickChatWithPrompt(accessor, prompt);
		}
	});

	registerAction2(class QuantumIDEApplyProposedSelectionEditAction extends Action2 {
		constructor() {
			super({
				id: QuantumIDEAICommandId.ApplyProposedSelectionEdit,
				title: localize2('quantumide.command.applyProposedSelectionEdit', 'QuantumIDE: Apply Proposed Edit from Clipboard'),
				category: localize2('quantumide.ai.category', 'QuantumIDE AI'),
			});
		}
		run(accessor: ServicesAccessor): Promise<void> {
			return applyProposedSelectionEditFromClipboard(accessor);
		}
	});

	registerAction2(class QuantumIDEApplyProposedFileEditsAction extends Action2 {
		constructor() {
			super({
				id: QuantumIDEAICommandId.ApplyProposedFileEdits,
				title: localize2('quantumide.command.applyProposedFileEdits', 'QuantumIDE: Apply Proposed File Edits from Clipboard'),
				category: localize2('quantumide.ai.category', 'QuantumIDE AI'),
			});
		}
		run(accessor: ServicesAccessor): Promise<void> {
			return applyProposedFileEditsFromClipboard(accessor);
		}
	});

	registerAction2(class QuantumIDERunProposedTerminalCommandAction extends Action2 {
		constructor() {
			super({
				id: QuantumIDEAICommandId.RunProposedTerminalCommand,
				title: localize2('quantumide.command.runProposedTerminalCommand', 'QuantumIDE: Run Proposed Terminal Command'),
				category: localize2('quantumide.ai.category', 'QuantumIDE AI'),
			});
		}
		run(accessor: ServicesAccessor): Promise<void> {
			return runProposedTerminalCommand(accessor);
		}
	});

	registerAction2(class QuantumIDERefreshWorkspaceIndexAction extends Action2 {
		constructor() {
			super({
				id: QuantumIDEAICommandId.RefreshWorkspaceIndex,
				title: localize2('quantumide.command.refreshWorkspaceIndex', 'QuantumIDE: Refresh Workspace AI Index'),
				category: localize2('quantumide.ai.category', 'QuantumIDE AI'),
			});
		}
		run(accessor: ServicesAccessor): Promise<void> {
			return refreshWorkspaceAIIndex(accessor);
		}
	});

	registerAction2(class QuantumIDEPinAgentTaskSpecAction extends Action2 {
		constructor() {
			super({
				id: QuantumIDEAICommandId.PinAgentTaskSpec,
				title: localize2('quantumide.ai.pinTaskSpec', 'QuantumIDE: Pin Active File as Agent Task Spec'),
				category: localize2('quantumide.ai.category', 'QuantumIDE AI'),
			});
		}
		run(accessor: ServicesAccessor): void {
			const editorService = accessor.get(IEditorService);
			const storageService = accessor.get(IStorageService);
			const notificationService = accessor.get(INotificationService);
			const resource = editorService.activeEditor?.resource;
			if (!resource) {
				notificationService.warn(localize('quantumide.ai.pinTaskSpec.noEditor', 'Open a file to pin as the agent task spec.'));
				return;
			}
			setPinnedTaskSpecUri(storageService, StorageScope.WORKSPACE, resource, StorageTarget.MACHINE);
			notificationService.info(localize('quantumide.ai.pinTaskSpec.done', 'Pinned {0} as the agent task spec for this workspace.', resource.fsPath));
		}
	});

	registerAction2(class QuantumIDEResumeAgentHandoffAction extends Action2 {
		constructor() {
			super({
				id: QuantumIDEAICommandId.ResumeAgentHandoff,
				title: localize2('quantumide.ai.resumeHandoff', 'QuantumIDE: Resume Agent Handoff'),
				category: localize2('quantumide.ai.category', 'QuantumIDE AI'),
			});
		}
		async run(accessor: ServicesAccessor): Promise<void> {
			const fileService = accessor.get(IFileService);
			const workspaceContextService = accessor.get(IWorkspaceContextService);
			const notificationService = accessor.get(INotificationService);
			const workspaceFolder = workspaceContextService.getWorkspace().folders[0]?.uri;
			const handoffText = await readAgentHandoffText(fileService, workspaceFolder);
			if (!handoffText) {
				notificationService.warn(localize('quantumide.ai.resumeHandoff.missing', 'No `.quantumide/agent-handoff.md` found in the workspace.'));
				return;
			}
			openQuickChatWithPrompt(accessor, [
				'Continue the previous agent task using this handoff:',
				'',
				handoffText,
				'',
				'Pick up where the last turn left off without re-asking for context already covered.',
			].join('\n'));
		}
	});

	const promptCommands = [
		{ id: QuantumIDEAICommandId.ProposeFix, title: localize2('quantumide.ai.proposeFix', 'QuantumIDE: Propose Fix'), prompt: 'Analyze the active editor context and propose a safe fix. Show the replacement text or a unified diff before applying changes. If the fix targets the selected code, provide a copyable replacement block that can be applied with QuantumIDE: Apply Proposed Edit from Clipboard.' },
		{ id: QuantumIDEAICommandId.GenerateTests, title: localize2('quantumide.ai.generateTests', 'QuantumIDE: Generate Tests'), prompt: 'Analyze the active editor context and propose focused tests for the behavior. Prefer existing project test patterns.' },
		{ id: QuantumIDEAICommandId.ReviewCurrentChanges, title: localize2('quantumide.ai.reviewCurrentChanges', 'QuantumIDE: Review Current Changes'), prompt: 'Review the current code changes for bugs, regressions, missing tests, and risky behavior. Lead with findings.' },
	];
	for (const command of promptCommands) {
		registerAction2(class QuantumIDEAIContextAction extends Action2 {
			constructor() {
				super({
					id: command.id,
					title: command.title,
					category: localize2('quantumide.ai.category', 'QuantumIDE AI'),
				});
			}
			async run(accessor: ServicesAccessor): Promise<void> {
				const active = getActiveEditorContext(accessor);
				const sections = [
					'You are QuantumIDE AI. Use the supplied workspace, editor, diagnostics, and source-control context before answering.',
					'',
					command.prompt,
					'',
					'Workspace folders:',
					buildWorkspaceContext(accessor),
					'',
					'Active editor diagnostics:',
					buildDiagnosticsContext(accessor, active),
				];
				if (command.id === QuantumIDEAICommandId.ReviewCurrentChanges) {
					sections.push(
						'',
						'Source-control changes:',
						await buildSCMChangesContext(accessor),
					);
				}
				sections.push(
					'',
					'Active editor context:',
					'```',
					active?.selectedText ?? active?.fullTextExcerpt ?? 'No active editor context is available.',
					'```',
				);
				openQuickChatWithPrompt(accessor, [
					...sections,
				].join('\n'));
			}
		});
	}
}

function registerQuantumIDEAIMenus(): void {
	MenuRegistry.appendMenuItem(MenuId.TitleBar, {
		command: {
			id: QuantumIDEAICommandId.OpenSettings,
			title: localize('quantumide.titlebarOpenSettings', 'Open QuantumIDE Settings'),
			icon: Codicon.settingsGear,
		},
		group: 'navigation',
		order: 9990,
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarPreferencesMenu, {
		group: '2_configuration',
		command: {
			id: QuantumIDEAICommandId.OpenSettings,
			title: localize({ key: 'quantumide.miOpenSettings', comment: ['&& denotes a mnemonic'] }, 'QuantumIDE &&Settings'),
		},
		order: 4,
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarPreferencesMenu, {
		group: '2_configuration',
		command: {
			id: QuantumIDEAICommandId.OpenAISettings,
			title: localize({ key: 'quantumide.miOpenAISettings', comment: ['&& denotes a mnemonic'] }, 'QuantumIDE &&AI Settings'),
		},
		order: 4.1,
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarPreferencesMenu, {
		group: '2_configuration',
		command: {
			id: QuantumIDEAICommandId.OpenSettingsModels,
			title: localize({ key: 'quantumide.miOpenModelsSettings', comment: ['&& denotes a mnemonic'] }, 'QuantumIDE &&Models Settings'),
		},
		order: 4.2,
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarPreferencesMenu, {
		group: '2_configuration',
		command: {
			id: QuantumIDEAICommandId.StoreOpenAIApiKey,
			title: localize({ key: 'quantumide.miStoreOpenAIApiKey', comment: ['&& denotes a mnemonic'] }, 'Store QuantumIDE OpenAI API &&Key'),
		},
		order: 5,
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarPreferencesMenu, {
		group: '2_configuration',
		command: {
			id: QuantumIDEAICommandId.TestOpenAIConnection,
			title: localize({ key: 'quantumide.miTestOpenAIConnection', comment: ['&& denotes a mnemonic'] }, 'Test QuantumIDE OpenAI &&Connection'),
		},
		order: 5.1,
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarPreferencesMenu, {
		group: '2_configuration',
		command: {
			id: QuantumIDEAICommandId.RefreshOpenAIModels,
			title: localize({ key: 'quantumide.miRefreshOpenAIModels', comment: ['&& denotes a mnemonic'] }, 'Refresh QuantumIDE OpenAI &&Models'),
		},
		order: 5.2,
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarPreferencesMenu, {
		group: '2_configuration',
		command: {
			id: QuantumIDEAICommandId.ClearOpenAIApiKey,
			title: localize({ key: 'quantumide.miClearOpenAIApiKey', comment: ['&& denotes a mnemonic'] }, 'Clear Stored QuantumIDE OpenAI API Key'),
		},
		order: 5.3,
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarPreferencesMenu, {
		group: '2_configuration',
		command: {
			id: QuantumIDEAICommandId.ShowProviderStatus,
			title: localize({ key: 'quantumide.miShowAIProviderStatus', comment: ['&& denotes a mnemonic'] }, 'Show QuantumIDE AI Provider &&Status'),
		},
		order: 6,
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
		group: '1_open',
		command: {
			id: QuantumIDEAICommandId.NewAgentChat,
			title: localize({ key: 'quantumide.miNewAgentChat', comment: ['&& denotes a mnemonic'] }, 'New &&Agent Chat'),
		},
		order: 24,
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
		group: '1_open',
		command: {
			id: QuantumIDEAICommandId.ApplyProposedSelectionEdit,
			title: localize({ key: 'quantumide.miApplyProposedEdit', comment: ['&& denotes a mnemonic'] }, 'Apply Proposed AI &&Edit'),
		},
		order: 25,
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
		group: '1_open',
		command: {
			id: QuantumIDEAICommandId.RunProposedTerminalCommand,
			title: localize({ key: 'quantumide.miRunProposedTerminalCommand', comment: ['&& denotes a mnemonic'] }, 'Run Proposed AI &&Terminal Command'),
		},
		order: 26,
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
		group: '1_open',
		command: {
			id: QuantumIDEAICommandId.ApplyProposedFileEdits,
			title: localize({ key: 'quantumide.miApplyProposedFileEdits', comment: ['&& denotes a mnemonic'] }, 'Apply Proposed AI &&File Edits'),
		},
		order: 27,
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
		group: '1_open',
		command: {
			id: QuantumIDEAICommandId.RefreshWorkspaceIndex,
			title: localize({ key: 'quantumide.miRefreshWorkspaceAIIndex', comment: ['&& denotes a mnemonic'] }, 'Refresh Workspace AI &&Index'),
		},
		order: 28,
	});
	MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
		command: {
			id: QuantumIDEAICommandId.PinAgentTaskSpec,
			title: localize('quantumide.miPinAgentTaskSpec', 'Pin Active File as Agent Task Spec'),
		},
	});
	MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
		command: {
			id: QuantumIDEAICommandId.ResumeAgentHandoff,
			title: localize('quantumide.miResumeAgentHandoff', 'Resume Agent Handoff'),
		},
	});
}

if (isQuantumIDEProduct()) {
	registerQuantumIDEAIConfiguration();
	registerQuantumIDEAICommands();
	registerQuantumIDEAIMenus();
}
