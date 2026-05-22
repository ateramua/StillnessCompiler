/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { QuantumIDEAISettingId, type QuantumIDEChatSettingsCategory } from '../../platform/quantumide/common/quantumideAISettings.js';

/** Opens Edit velocity + Verify on edit in the standard Settings UI (searchable by description). */
export const AGENT_WORKFLOW_SETTINGS_QUERY = [
	QuantumIDEAISettingId.AgentEditVelocity,
	QuantumIDEAISettingId.AgentVerifyOnEdit,
].map(id => `@id:${id}`).join(' ');

/** Filter queries for embedded settings editor per category (shared by panel + hub). */
export const SETTINGS_QUERIES: Record<QuantumIDEChatSettingsCategory, string> = {
	general: [QuantumIDEAISettingId.Enabled, QuantumIDEAISettingId.ChatDefaultMode, 'workbench.startupEditor', 'workbench.colorTheme'].map(id => `@id:${id}`).join(' '),
	models: [
		QuantumIDEAISettingId.DefaultProvider,
		QuantumIDEAISettingId.OpenAIModel,
		QuantumIDEAISettingId.OpenAIBaseUrl,
		QuantumIDEAISettingId.ModelRouterRoutes,
		QuantumIDEAISettingId.ModelFallbackRoute,
		QuantumIDEAISettingId.ModelTaskRoutes,
		QuantumIDEAISettingId.ChatTokenBudget,
	].map(id => `@id:${id}`).join(' '),
	chat: [
		QuantumIDEAISettingId.ChatSyncRealtime,
		QuantumIDEAISettingId.ChatInlineEnabled,
		QuantumIDEAISettingId.ChatDiffSideBySide,
		QuantumIDEAISettingId.ChatTokenBudget,
		QuantumIDEAISettingId.ChatPerfInstrumentationEnabled,
		QuantumIDEAISettingId.ChatPerfInstrumentationVerbose,
		QuantumIDEAISettingId.ChatPerfInstrumentationLogToConsole,
	].map(id => `@id:${id}`).join(' '),
	agent: [
		QuantumIDEAISettingId.AgentAutoApplyEdits,
		QuantumIDEAISettingId.AgentVerifyOnEdit,
		QuantumIDEAISettingId.AgentFastApplyEdits,
		QuantumIDEAISettingId.AgentEditVelocity,
		QuantumIDEAISettingId.AgentPreferDirectEditorEdits,
		QuantumIDEAISettingId.AgentInstantPaletteCommands,
		QuantumIDEAISettingId.AgentAutoApplyThreshold,
		QuantumIDEAISettingId.AgentMaxEditScope,
		QuantumIDEAISettingId.AgentRetryOnError,
		QuantumIDEAISettingId.AgentRefactorAutoVerify,
		QuantumIDEAISettingId.AgentPreferLspRename,
		QuantumIDEAISettingId.AgentDangerousCommandBlock,
		QuantumIDEAISettingId.AgentVelocityProfile,
	].map(id => `@id:${id}`).join(' '),
	editor: [
		QuantumIDEAISettingId.ChatInlineEnabled,
		QuantumIDEAISettingId.ChatInlineGhostText,
		QuantumIDEAISettingId.ChatDiffPartialHunks,
		QuantumIDEAISettingId.ChatDiffSideBySide,
		'editor.fontSize',
		'editor.formatOnSave',
		'editor.codeActionsOnSave',
	].map(id => `@id:${id}`).join(' '),
	terminal: [QuantumIDEAISettingId.TerminalAutoApproveSafe, QuantumIDEAISettingId.AgentRequireConfirmationForTerminal, 'terminal.integrated.defaultProfile.osx'].map(id => `@id:${id}`).join(' '),
	indexing: [
		QuantumIDEAISettingId.IndexingEnabled,
		QuantumIDEAISettingId.SemanticIndexingEnabled,
		QuantumIDEAISettingId.IndexingEmbeddingProvider,
		QuantumIDEAISettingId.IndexingVectorStore,
		QuantumIDEAISettingId.IndexingScaleProfile,
		QuantumIDEAISettingId.IndexingExcludePatterns,
		QuantumIDEAISettingId.IndexingReindexOnDemand,
		QuantumIDEAISettingId.IndexingMaxFiles,
		QuantumIDEAISettingId.IndexingMaxFileChars,
		QuantumIDEAISettingId.IndexingMaxCacheMb,
		QuantumIDEAISettingId.MemoryBudgetMb,
	].map(id => `@id:${id}`).join(' '),
	privacy: [
		QuantumIDEAISettingId.PrivacyLocalIndexingOnly,
		QuantumIDEAISettingId.PrivacyEncryptIndexCache,
		QuantumIDEAISettingId.PrivacyTelemetryOptIn,
		'telemetry.telemetryLevel',
		QuantumIDEAISettingId.AgentAuditEnabled,
	].map(id => `@id:${id}`).join(' '),
	workspace: [QuantumIDEAISettingId.IndexingEnabled, 'files.exclude', 'search.exclude'].map(id => `@id:${id}`).join(' '),
	security: [
		QuantumIDEAISettingId.AgentAutoApplyEdits,
		QuantumIDEAISettingId.AgentVerifyOnEdit,
		QuantumIDEAISettingId.AgentEditVelocity,
		QuantumIDEAISettingId.AgentRequireConfirmationForFileDelete,
		QuantumIDEAISettingId.AgentDangerousCommandBlock,
	].map(id => `@id:${id}`).join(' '),
	appearance: ['workbench.colorTheme', 'workbench.iconTheme', 'window.zoomLevel'].map(id => `@id:${id}`).join(' '),
	keybindings: ['@tag:keybindingsTag'].join(' '),
	accounts: ['@tag:accounts'].join(' '),
	extensions: ['extensions.autoUpdate', 'extensions.ignoreRecommendations', 'mcp'].map(id => `@id:${id}`).join(' '),
	experimental: [
		QuantumIDEAISettingId.SemanticIndexingEnabled,
		QuantumIDEAISettingId.PerformanceEnforceBudgets,
		'chat.agentHost.clientTools',
		'chat.tools.renameTool.enabled',
	].map(id => `@id:${id}`).join(' '),
};
