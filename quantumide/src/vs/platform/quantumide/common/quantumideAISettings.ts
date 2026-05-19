/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

export const enum QuantumIDEAIProvider {
	Auto = 'auto',
	OpenAI = 'openai',
	Copilot = 'copilot',
	Claude = 'claude',
	Local = 'local',
}

export const enum QuantumIDEAISettingId {
	Enabled = 'quantumide.ai.enabled',
	DefaultProvider = 'quantumide.ai.defaultProvider',
	OpenAIApiKeyStorage = 'quantumide.ai.openai.apiKeyStorage',
	OpenAIModel = 'quantumide.ai.openai.model',
	OpenAIBaseUrl = 'quantumide.ai.openai.baseUrl',
	ModelRouterRoutes = 'quantumide.ai.modelRouter.routes',
	OpenAIGPT41Enabled = 'quantumide.ai.openai.models.gpt41.enabled',
	OpenAIGPT41MiniEnabled = 'quantumide.ai.openai.models.gpt41Mini.enabled',
	OpenAIGPT4oEnabled = 'quantumide.ai.openai.models.gpt4o.enabled',
	OpenAIStreamingEnabled = 'quantumide.ai.openai.streaming.enabled',
	OpenAIStreamingCoalesceMs = 'quantumide.ai.openai.streaming.coalesceMs',
	OpenAIStreamingAdaptiveCoalescing = 'quantumide.ai.openai.streaming.adaptiveCoalescing',
	AgentShowActivitySteps = 'quantumide.ai.agent.showActivitySteps',
	AgentActivityVerbosity = 'quantumide.ai.agent.activityVerbosity',
	AgentMaxToolIterations = 'quantumide.ai.agent.maxToolIterations',
	AgentMaxActivityStepsPerTurn = 'quantumide.ai.agent.maxActivityStepsPerTurn',
	AgentActivityDebugOutput = 'quantumide.ai.agent.activityDebugOutput',
	AgentAutoApplyEdits = 'quantumide.ai.agent.autoApplyEdits',
	AgentRequireConfirmationForTerminal = 'quantumide.ai.agent.requireConfirmationForTerminal',
	AgentRequireConfirmationForFileDelete = 'quantumide.ai.agent.requireConfirmationForFileDelete',
	AgentMaxContextFiles = 'quantumide.ai.agent.maxContextFiles',
	AgentAuditEnabled = 'quantumide.ai.agent.audit.enabled',
	IndexingEnabled = 'quantumide.ai.indexing.enabled',
	IndexingExcludePatterns = 'quantumide.ai.indexing.excludePatterns',
	SemanticIndexingEnabled = 'quantumide.ai.semanticIndexing.enabled',
}

export const enum QuantumIDEAICommandId {
	OpenSettings = 'quantumide.settings.open',
	OpenAISettings = 'quantumide.ai.openSettings',
	OpenSettingsAI = 'quantumide.settings.openAI',
	OpenSettingsModels = 'quantumide.settings.openModels',
	OpenSettingsWorkspace = 'quantumide.settings.openWorkspace',
	OpenSettingsSecurity = 'quantumide.settings.openSecurity',
	ShowProviderStatus = 'quantumide.ai.showProviderStatus',
	StoreOpenAIApiKey = 'quantumide.ai.openai.storeApiKey',
	TestOpenAIConnection = 'quantumide.ai.openai.testConnection',
	RefreshOpenAIModels = 'quantumide.ai.openai.refreshModels',
	ClearOpenAIApiKey = 'quantumide.ai.openai.clearApiKey',
	NewAgentChat = 'quantumide.ai.newAgentChat',
	AskAboutWorkspace = 'quantumide.ai.askAboutWorkspace',
	ExplainSelection = 'quantumide.ai.explainSelection',
	ProposeFix = 'quantumide.ai.proposeFix',
	ApplyProposedSelectionEdit = 'quantumide.ai.applyProposedSelectionEdit',
	ApplyProposedFileEdits = 'quantumide.ai.applyProposedFileEdits',
	GenerateTests = 'quantumide.ai.generateTests',
	ReviewCurrentChanges = 'quantumide.ai.reviewCurrentChanges',
	RunProposedTerminalCommand = 'quantumide.ai.runProposedTerminalCommand',
	RefreshWorkspaceIndex = 'quantumide.ai.refreshWorkspaceIndex',
}

export const QuantumIDEOpenAIProviderId = 'openai';
export const QuantumIDEOpenAIApiKeyEnvVar = 'QUANTUMIDE_OPENAI_API_KEY';
export const QuantumIDEOpenAIBaseUrlEnvVar = 'QUANTUMIDE_OPENAI_BASE_URL';
export const QuantumIDEOpenAIStreamEnvVar = 'QUANTUMIDE_OPENAI_STREAM';
export const QuantumIDEAgentActivityEnvVar = 'QUANTUMIDE_AGENT_ACTIVITY';
export const QuantumIDEOpenAIApiKeySecretStorageKey = 'quantumide.openai.apiKey';
export const QuantumIDEOpenAIProtectedResourceId = 'https://quantumide.local/openai';
