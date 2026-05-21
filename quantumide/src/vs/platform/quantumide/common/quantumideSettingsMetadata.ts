/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import type { QuantumIDEChatSettingsCategory } from './quantumideAISettings.js';

export interface IQuantumIDESettingsCategoryMeta {
	readonly id: QuantumIDEChatSettingsCategory;
	readonly title: string;
	readonly description: string;
	readonly searchHint: string;
}

export const QUANTUMIDE_SETTINGS_CATEGORIES: readonly IQuantumIDESettingsCategoryMeta[] = [
	{ id: 'general', title: 'General', description: 'UI preferences and core QuantumIDE AI enablement.', searchHint: 'startup theme enabled' },
	{ id: 'models', title: 'AI Models', description: 'Providers, API keys, routing, fallbacks, and task-specific models.', searchHint: 'openai model router api key fallback' },
	{ id: 'chat', title: 'Chat', description: 'Chat behavior, modes, token budget, and realtime sync.', searchHint: 'chat mode sync token inline' },
	{ id: 'agent', title: 'Agent', description: 'Autonomous workflows, auto-apply, retries, and safety.', searchHint: 'agent auto apply retry velocity' },
	{ id: 'editor', title: 'Editor', description: 'Inline AI commands and editor integration.', searchHint: 'inline editor format' },
	{ id: 'terminal', title: 'Terminal', description: 'Command permissions and terminal approvals.', searchHint: 'terminal approve command' },
	{ id: 'indexing', title: 'Indexing', description: 'Repository indexing, embeddings, exclusions, and cache.', searchHint: 'indexing semantic embedding exclude' },
	{ id: 'privacy', title: 'Privacy', description: 'Telemetry opt-in and local-only indexing.', searchHint: 'privacy telemetry local' },
	{ id: 'workspace', title: 'Workspace', description: 'Workspace folders, excludes, and indexing scope.', searchHint: 'workspace exclude files' },
	{ id: 'security', title: 'Security', description: 'Agent permissions, dangerous commands, and edit policies.', searchHint: 'security agent terminal delete' },
	{ id: 'appearance', title: 'Appearance', description: 'Themes, icons, and window layout.', searchHint: 'theme icon zoom' },
	{ id: 'keybindings', title: 'Keybindings', description: 'Searchable shortcuts, remapping, import/export.', searchHint: 'keybinding shortcut' },
	{ id: 'accounts', title: 'Accounts', description: 'Authentication and signed-in providers.', searchHint: 'account sign in' },
	{ id: 'extensions', title: 'Extensions', description: 'Extension management and MCP integrations.', searchHint: 'extensions mcp' },
	{ id: 'experimental', title: 'Experimental', description: 'Beta features and advanced agent host tools.', searchHint: 'experimental beta' },
];
