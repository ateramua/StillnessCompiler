/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { QuantumIDEAISettingId, type QuantumIDEChatSettingsCategory } from './quantumideAISettings.js';
import { getQuantumIDEPlugins } from './quantumidePluginRegistry.js';

export function buildQuantumIDESettingsPreviewLines(
	category: QuantumIDEChatSettingsCategory,
	values: Readonly<Record<string, unknown>>,
): string[] {
	switch (category) {
		case 'general':
			return [
				`AI enabled: ${formatPreviewValue(values[QuantumIDEAISettingId.Enabled])}`,
				`Default chat mode: ${formatPreviewValue(values[QuantumIDEAISettingId.ChatDefaultMode])}`,
			];
		case 'models':
			return [
				`Provider: ${formatPreviewValue(values[QuantumIDEAISettingId.DefaultProvider])}`,
				`OpenAI model: ${formatPreviewValue(values[QuantumIDEAISettingId.OpenAIModel])}`,
				`Fallback route: ${formatPreviewValue(values[QuantumIDEAISettingId.ModelFallbackRoute])}`,
				`Task routes: ${formatPreviewValue(values[QuantumIDEAISettingId.ModelTaskRoutes])}`,
			];
		case 'chat':
			return [
				`Realtime sync: ${formatPreviewValue(values[QuantumIDEAISettingId.ChatSyncRealtime])}`,
				`Token budget: ${formatPreviewValue(values[QuantumIDEAISettingId.ChatTokenBudget])}`,
				`Inline AI: ${formatPreviewValue(values[QuantumIDEAISettingId.ChatInlineEnabled])}`,
			];
		case 'agent':
			return [
				`Auto-apply edits: ${formatPreviewValue(values[QuantumIDEAISettingId.AgentAutoApplyEdits])}`,
				`Auto-apply threshold: ${formatPreviewValue(values[QuantumIDEAISettingId.AgentAutoApplyThreshold])}`,
				`Retry on error: ${formatPreviewValue(values[QuantumIDEAISettingId.AgentRetryOnError])}`,
				`Refactor auto-verify: ${formatPreviewValue(values[QuantumIDEAISettingId.AgentRefactorAutoVerify])}`,
				`Prefer LSP rename: ${formatPreviewValue(values[QuantumIDEAISettingId.AgentPreferLspRename])}`,
				`Max edit scope: ${formatPreviewValue(values[QuantumIDEAISettingId.AgentMaxEditScope])}`,
			];
		case 'editor':
			return [
				`Inline AI: ${formatPreviewValue(values[QuantumIDEAISettingId.ChatInlineEnabled])}`,
				`Inline ghost preview: ${formatPreviewValue(values[QuantumIDEAISettingId.ChatInlineGhostText])}`,
				`Partial hunk apply: ${formatPreviewValue(values[QuantumIDEAISettingId.ChatDiffPartialHunks])}`,
				`Side-by-side diff: ${formatPreviewValue(values[QuantumIDEAISettingId.ChatDiffSideBySide])}`,
			];
		case 'indexing':
			return [
				`Indexing: ${formatPreviewValue(values[QuantumIDEAISettingId.IndexingEnabled])}`,
				`Semantic indexing: ${formatPreviewValue(values[QuantumIDEAISettingId.SemanticIndexingEnabled])}`,
				`Embedding provider: ${formatPreviewValue(values[QuantumIDEAISettingId.IndexingEmbeddingProvider])}`,
				`Max files: ${formatPreviewValue(values[QuantumIDEAISettingId.IndexingMaxFiles])}`,
				`Max cache (MB): ${formatPreviewValue(values[QuantumIDEAISettingId.IndexingMaxCacheMb])}`,
			];
		case 'privacy':
			return [
				`Local indexing only: ${formatPreviewValue(values[QuantumIDEAISettingId.PrivacyLocalIndexingOnly])}`,
				`Encrypt index cache: ${formatPreviewValue(values[QuantumIDEAISettingId.PrivacyEncryptIndexCache])}`,
				`Telemetry opt-in: ${formatPreviewValue(values[QuantumIDEAISettingId.PrivacyTelemetryOptIn])}`,
			];
		case 'terminal':
			return [
				`Require terminal confirmation: ${formatPreviewValue(values[QuantumIDEAISettingId.AgentRequireConfirmationForTerminal])}`,
				`Auto-approve safe commands: ${formatPreviewValue(values[QuantumIDEAISettingId.TerminalAutoApproveSafe])}`,
			];
		case 'workspace':
			return [
				`Indexing enabled: ${formatPreviewValue(values[QuantumIDEAISettingId.IndexingEnabled])}`,
				`Exclude patterns: ${formatPreviewValue(values[QuantumIDEAISettingId.IndexingExcludePatterns])}`,
			];
		case 'security':
			return [
				`Auto-apply edits: ${formatPreviewValue(values[QuantumIDEAISettingId.AgentAutoApplyEdits])}`,
				`Dangerous command block: ${formatPreviewValue(values[QuantumIDEAISettingId.AgentDangerousCommandBlock])}`,
				`Delete confirmation: ${formatPreviewValue(values[QuantumIDEAISettingId.AgentRequireConfirmationForFileDelete])}`,
			];
		case 'appearance':
			return [localizePreview('Theme and layout settings apply to the whole workbench.')];
		case 'keybindings':
			return [localizePreview('Use the toolbar to open, import, export, or detect keybinding conflicts.')];
		case 'accounts':
			return [
				localizePreview('QuantumIDE uses VS Code account sign-in for providers (OpenAI, Copilot, Claude).'),
				`Default provider: ${formatPreviewValue(values[QuantumIDEAISettingId.DefaultProvider])}`,
			];
		case 'extensions':
			return [
				localizePreview('Extensions and MCP servers extend agent tools and retrieval.'),
				`Registered plugins: ${getQuantumIDEPlugins().length} (use QuantumIDE: List Registered Plugins).`,
			];
		case 'experimental':
			return [
				`Performance enforce budgets: ${formatPreviewValue(values[QuantumIDEAISettingId.PerformanceEnforceBudgets])}`,
				`Semantic indexing: ${formatPreviewValue(values[QuantumIDEAISettingId.SemanticIndexingEnabled])}`,
			];
		default:
			return [localizePreview('Changes apply immediately and persist across sessions.')];
	}
}

function formatPreviewValue(value: unknown): string {
	if (value === undefined || value === null) {
		return '—';
	}
	if (typeof value === 'object') {
		try {
			return JSON.stringify(value);
		} catch {
			return String(value);
		}
	}
	return String(value);
}

function localizePreview(text: string): string {
	return text;
}

export const QUANTUMIDE_SETTINGS_PREVIEW_KEYS: Partial<Record<QuantumIDEChatSettingsCategory, readonly string[]>> = {
	general: [QuantumIDEAISettingId.Enabled, QuantumIDEAISettingId.ChatDefaultMode],
	models: [
		QuantumIDEAISettingId.DefaultProvider,
		QuantumIDEAISettingId.OpenAIModel,
		QuantumIDEAISettingId.ModelFallbackRoute,
		QuantumIDEAISettingId.ModelTaskRoutes,
	],
	chat: [QuantumIDEAISettingId.ChatSyncRealtime, QuantumIDEAISettingId.ChatTokenBudget, QuantumIDEAISettingId.ChatInlineEnabled],
	agent: [
		QuantumIDEAISettingId.AgentAutoApplyEdits,
		QuantumIDEAISettingId.AgentAutoApplyThreshold,
		QuantumIDEAISettingId.AgentRetryOnError,
		QuantumIDEAISettingId.AgentMaxEditScope,
	],
	editor: [
		QuantumIDEAISettingId.ChatInlineEnabled,
		QuantumIDEAISettingId.ChatInlineGhostText,
		QuantumIDEAISettingId.ChatDiffPartialHunks,
		QuantumIDEAISettingId.ChatDiffSideBySide,
		'editor.fontSize',
	],
	indexing: [
		QuantumIDEAISettingId.IndexingEnabled,
		QuantumIDEAISettingId.SemanticIndexingEnabled,
		QuantumIDEAISettingId.IndexingEmbeddingProvider,
		QuantumIDEAISettingId.IndexingVectorStore,
		QuantumIDEAISettingId.IndexingScaleProfile,
		QuantumIDEAISettingId.IndexingMaxFiles,
		QuantumIDEAISettingId.IndexingMaxFileChars,
		QuantumIDEAISettingId.IndexingMaxCacheMb,
	],
	privacy: [QuantumIDEAISettingId.PrivacyLocalIndexingOnly, QuantumIDEAISettingId.PrivacyEncryptIndexCache, QuantumIDEAISettingId.PrivacyTelemetryOptIn],
	terminal: [QuantumIDEAISettingId.AgentRequireConfirmationForTerminal, QuantumIDEAISettingId.TerminalAutoApproveSafe],
	workspace: [QuantumIDEAISettingId.IndexingEnabled, QuantumIDEAISettingId.IndexingExcludePatterns, 'files.exclude'],
	security: [
		QuantumIDEAISettingId.AgentAutoApplyEdits,
		QuantumIDEAISettingId.AgentDangerousCommandBlock,
		QuantumIDEAISettingId.AgentRequireConfirmationForFileDelete,
	],
	experimental: [QuantumIDEAISettingId.SemanticIndexingEnabled, QuantumIDEAISettingId.PerformanceEnforceBudgets],
};
