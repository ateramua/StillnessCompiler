/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../../base/common/codicons.js';
import { Disposable, DisposableMap, DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { Event } from '../../../../../../base/common/event.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { localize } from '../../../../../../nls.js';
import { AgentHostEnabledSettingId, IAgentHostService, type AgentProvider } from '../../../../../../platform/agentHost/common/agentService.js';
import { ActionType } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { type ProtectedResourceMetadata } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { type AgentInfo, type CustomizationRef, type RootState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IOutputService } from '../../../../../services/output/common/output.js';
import { IDefaultAccountService } from '../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import product from '../../../../../../platform/product/common/product.js';
import { IQuickInputService } from '../../../../../../platform/quickinput/common/quickInput.js';
import { QuantumIDEAISettingId, QuantumIDEOpenAIApiKeySecretStorageKey, QuantumIDEOpenAIProtectedResourceId } from '../../../../../../platform/quantumide/common/quantumideAISettings.js';
import { defaultQuantumIDEModelRoutes, QuantumIDEModelRouterConfigKey, sanitizeQuantumIDEModelRoutes } from '../../../../../../platform/quantumide/common/quantumideModelRouter.js';
import { ISecretStorageService } from '../../../../../../platform/secrets/common/secrets.js';
import { IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { IWorkbenchContribution } from '../../../../../common/contributions.js';
import { IAgentHostFileSystemService } from '../../../../../services/agentHost/common/agentHostFileSystemService.js';
import { IAuthenticationService } from '../../../../../services/authentication/common/authentication.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { IChatSessionsService } from '../../../common/chatSessionsService.js';
import { ICustomizationHarnessService } from '../../../common/customizationHarnessService.js';
import { ILanguageModelsService } from '../../../common/languageModels.js';
import { IAgentPluginService } from '../../../common/plugins/agentPluginService.js';
import { IPromptsService, PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';
import { AgentCustomizationItemProvider } from './agentCustomizationItemProvider.js';
import { AgentCustomizationSyncProvider } from './agentCustomizationSyncProvider.js';
import { resolveCustomizationRefs } from './agentHostLocalCustomizations.js';
import { authenticateProtectedResources, AgentHostAuthTokenCache, resolveAuthenticationInteractively } from './agentHostAuth.js';
import { AgentHostLanguageModelProvider } from './agentHostLanguageModelProvider.js';
import { AgentHostSessionHandler } from './agentHostSessionHandler.js';
import { AgentHostSessionListController } from './agentHostSessionListController.js';
import { LoggingAgentConnection } from './loggingAgentConnection.js';
import { QuantumIDEAgentActivityLogger } from './quantumideAgentActivityLog.js';
import { SyncedCustomizationBundler } from './syncedCustomizationBundler.js';

export { AgentHostSessionHandler } from './agentHostSessionHandler.js';
export { AgentHostSessionListController } from './agentHostSessionListController.js';

const isQuantumIDEProduct = product.applicationName === 'quantumide' || product.nameShort.startsWith('QuantumIDE');

/**
 * Discovers available agents from the agent host process and dynamically
 * registers each one as a chat session type with its own session handler,
 * list controller, and language model provider.
 *
 * Gated on the `chat.agentHost.enabled` setting.
 */
export class AgentHostContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.agentHostContribution';

	private _loggedConnection: LoggingAgentConnection | undefined;

	private readonly _agentRegistrations = this._register(new DisposableMap<AgentProvider, DisposableStore>());
	/** Model providers keyed by agent provider, for pushing model updates. */
	private readonly _modelProviders = new Map<AgentProvider, AgentHostLanguageModelProvider>();
	/** List controllers keyed by agent provider, for cache resets on reconnect. */
	private readonly _listControllers = new Map<AgentProvider, AgentHostSessionListController>();

	/** Dedupes redundant `authenticate` RPCs when the resolved token hasn't changed. */
	private readonly _authTokenCache = new AgentHostAuthTokenCache();

	private readonly _isSessionsWindow: boolean;

	constructor(
		@IAgentHostService private readonly _agentHostService: IAgentHostService,
		@IChatSessionsService private readonly _chatSessionsService: IChatSessionsService,
		@IDefaultAccountService private readonly _defaultAccountService: IDefaultAccountService,
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
		@ILogService private readonly _logService: ILogService,
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IAgentHostFileSystemService _agentHostFileSystemService: IAgentHostFileSystemService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ICustomizationHarnessService private readonly _customizationHarnessService: ICustomizationHarnessService,
		@IStorageService private readonly _storageService: IStorageService,
		@IAgentPluginService private readonly _agentPluginService: IAgentPluginService,
		@IPromptsService private readonly _promptsService: IPromptsService,
		@IFileService private readonly _fileService: IFileService,
		@ISecretStorageService private readonly _secretStorageService: ISecretStorageService,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
	) {
		super();

		this._isSessionsWindow = environmentService.isSessionsWindow;

		if (!this._configurationService.getValue<boolean>(AgentHostEnabledSettingId) && !isQuantumIDEProduct) {
			return;
		}

		// Wrap the agent host service with logging to a dedicated output channel
		this._loggedConnection = this._register(this._instantiationService.createInstance(
			LoggingAgentConnection,
			this._agentHostService,
			`agenthost.${this._agentHostService.clientId}`,
			'Agent Host (Local)'));

		this._register(_agentHostFileSystemService.registerAuthority('local', this._agentHostService));
		if (isQuantumIDEProduct) {
			this._register(this._instantiationService.invokeFunction(accessor => new QuantumIDEAgentActivityLogger(
				this._loggedConnection!,
				accessor.get(IOutputService),
				accessor.get(IConfigurationService),
			)));
			this._syncQuantumIDEOpenAIAgentConfig();
			this._register(this._configurationService.onDidChangeConfiguration(event => {
				if (
					event.affectsConfiguration(QuantumIDEAISettingId.ModelRouterRoutes)
					|| event.affectsConfiguration(QuantumIDEAISettingId.OpenAIGPT41Enabled)
					|| event.affectsConfiguration(QuantumIDEAISettingId.OpenAIGPT41MiniEnabled)
					|| event.affectsConfiguration(QuantumIDEAISettingId.OpenAIGPT4oEnabled)
					|| event.affectsConfiguration(QuantumIDEAISettingId.OpenAIStreamingEnabled)
					|| event.affectsConfiguration(QuantumIDEAISettingId.OpenAIStreamingCoalesceMs)
					|| event.affectsConfiguration(QuantumIDEAISettingId.OpenAIStreamingAdaptiveCoalescing)
					|| event.affectsConfiguration(QuantumIDEAISettingId.AgentMaxToolIterations)
					|| event.affectsConfiguration(QuantumIDEAISettingId.AgentIterateUntilComplete)
					|| event.affectsConfiguration(QuantumIDEAISettingId.AgentIterateUntilCompleteMaxContinuations)
					|| event.affectsConfiguration(QuantumIDEAISettingId.AgentActivityVerbosity)
					|| event.affectsConfiguration(QuantumIDEAISettingId.AgentMaxActivityStepsPerTurn)
					|| event.affectsConfiguration(QuantumIDEAISettingId.AgentVelocityProfile)
					|| event.affectsConfiguration(QuantumIDEAISettingId.AgentVelocityParallelHostTools)
					|| event.affectsConfiguration(QuantumIDEAISettingId.AgentVelocityCrossRootSearch)
					|| event.affectsConfiguration(QuantumIDEAISettingId.AgentVelocityHandoffEnabled)
				) {
					this._syncQuantumIDEOpenAIAgentConfig();
				}
			}));
		}

		// React to root state changes (agent discovery / removal)
		this._register(this._agentHostService.rootState.onDidChange(rootState => {
			this._handleRootStateChange(rootState);
		}));

		// Clear the auth cache whenever the local agent host (re)starts so the
		// first post-restart authenticate RPC is never skipped as "unchanged".
		// Also reset each list controller's session cache so the next refresh
		// re-fetches via listSessions() rather than serving a stale in-memory list.
		this._register(this._agentHostService.onAgentHostStart(() => {
			this._authTokenCache.clear();
			for (const controller of this._listControllers.values()) {
				controller.resetCache();
			}
		}));

		// Process initial root state if already available
		const initialRootState = this._agentHostService.rootState.value;
		if (initialRootState && !(initialRootState instanceof Error)) {
			this._handleRootStateChange(initialRootState);
		}
	}

	private _handleRootStateChange(rootState: RootState): void {
		const incoming = new Set(rootState.agents.map(a => a.provider));

		// Remove agents that are no longer present
		for (const [provider] of this._agentRegistrations) {
			if (!incoming.has(provider)) {
				this._agentRegistrations.deleteAndDispose(provider);
				this._modelProviders.delete(provider);
			}
		}

		// Authenticate using protectedResources from agent info
		this._authenticateWithServer(rootState.agents)
			.catch(() => { /* best-effort */ });

		// Register new agents and push model updates to existing ones
		for (const agent of rootState.agents) {
			if (!this._agentRegistrations.has(agent.provider)) {
				this._registerAgent(agent);
			} else {
				// Push updated models to existing model provider
				const modelProvider = this._modelProviders.get(agent.provider);
				modelProvider?.updateModels(agent.models);
			}
		}
	}

	private _registerAgent(agent: AgentInfo): void {
		const store = new DisposableStore();
		this._agentRegistrations.set(agent.provider, store);
		const sessionType = `agent-host-${agent.provider}`;
		const agentId = sessionType;
		const vendor = sessionType;

		// In the Agents app, the agent-host displayName is unambiguous because
		// only agent-host sessions exist there. In VS Code, the same picker
		// also lists the extension-host harness with the same displayName
		// (e.g. "Copilot CLI"), so suffix with "- Agent Host" to disambiguate.
		const displayName = this._isSessionsWindow
			? agent.displayName
			: localize('agentHost.displayName', "{0} - Agent Host", agent.displayName);

		// Chat session contribution.
		// In the Agents app, hide the delegation picker for local agent host
		// sessions (matches behavior of remote agent host sessions). In VS Code,
		// keep the picker available so users can hand off to other targets.
		store.add(this._chatSessionsService.registerChatSessionContribution({
			type: sessionType,
			name: agentId,
			displayName,
			description: agent.description,
			canDelegate: true,
			requiresCustomModels: true,
			supportsDelegation: !this._isSessionsWindow,
			capabilities: {
				supportsCheckpoints: true,
				supportsPromptAttachments: true,
			},
		}));

		// Session list controller. In QuantumIDE's OpenAI-first local flow,
		// avoid registering unauthenticated Copilot session lists: the list
		// refresh probes GitHub/Copilot and creates noisy auth failures even
		// when the user is only using the OpenAI provider.
		const listController = store.add(this._instantiationService.createInstance(AgentHostSessionListController, sessionType, agent.provider, this._loggedConnection!, undefined, 'local'));
		if (!isQuantumIDEProduct || agent.provider === 'openai') {
			this._listControllers.set(agent.provider, listController);
			store.add({ dispose: () => this._listControllers.delete(agent.provider) });
			store.add(this._chatSessionsService.registerChatSessionItemController(sessionType, listController));
		}

		// Customization disable provider + item provider + bundler + observable
		const syncProvider = store.add(new AgentCustomizationSyncProvider(sessionType, this._storageService));
		const itemProvider = store.add(new AgentCustomizationItemProvider(agent, this._loggedConnection!, 'local', this._fileService, this._logService));
		const bundler = store.add(this._instantiationService.createInstance(SyncedCustomizationBundler, sessionType));
		// Distinguish from the extension-host Copilot CLI harness, which
		// registers under the same `Copilot CLI` displayName via the chat
		// session customization provider API. Without the `[Local]` suffix
		// both harnesses render identically in the customizations view.
		// Matches the workspace-label convention from
		// `buildAgentHostSessionWorkspace` and the provider-name in
		// `getAgentSessionProviderName(AgentHostCopilot)`.
		store.add(this._customizationHarnessService.registerExternalHarness({
			id: sessionType,
			label: localize('agentHostHarnessLabel.local', "{0} [Local]", agent.displayName),
			icon: ThemeIcon.fromId(Codicon.server.id),
			hiddenSections: [],
			hideGenerateButton: true,
			getStorageSourceFilter: () => ({ sources: [PromptsStorage.local, PromptsStorage.user, PromptsStorage.plugin] }),
			syncProvider,
			itemProvider,
		}));

		const customizations = observableValue<CustomizationRef[]>('agentCustomizations', []);
		const updateCustomizations = async () => {
			const refs = await resolveCustomizationRefs(this._promptsService, syncProvider, this._agentPluginService, bundler, sessionType);
			customizations.set(refs, undefined);
		};
		store.add(syncProvider.onDidChange(() => updateCustomizations()));
		store.add(Event.any(
			this._promptsService.onDidChangeCustomAgents,
			this._promptsService.onDidChangeSlashCommands,
			this._promptsService.onDidChangeSkills,
			this._promptsService.onDidChangeInstructions,
		)(() => updateCustomizations()));
		updateCustomizations(); // resolve initial state

		// Session handler
		const sessionHandler = store.add(this._instantiationService.createInstance(AgentHostSessionHandler, {
			provider: agent.provider,
			agentId,
			sessionType,
			fullName: agent.displayName,
			description: agent.description,
			connection: this._loggedConnection!,
			connectionAuthority: 'local',
			isNewSession: sessionResource => listController.isNewSession(sessionResource),
			resolveAuthentication: (resources) => this._resolveAuthenticationInteractively(resources),
			customizations,
		}));
		store.add(this._chatSessionsService.registerChatSessionContentProvider(sessionType, sessionHandler));

		// Language model provider.
		// Order matters: `updateModels` must be called after
		// `registerLanguageModelProvider` so the initial `onDidChange` is observed.
		const vendorDescriptor = { vendor, displayName: agent.displayName, configuration: undefined, managementCommand: undefined, when: undefined };
		this._languageModelsService.deltaLanguageModelChatProviderDescriptors([vendorDescriptor], []);
		store.add(toDisposable(() => this._languageModelsService.deltaLanguageModelChatProviderDescriptors([], [vendorDescriptor])));
		const modelProvider = store.add(new AgentHostLanguageModelProvider(sessionType, vendor));
		this._modelProviders.set(agent.provider, modelProvider);
		store.add(toDisposable(() => this._modelProviders.delete(agent.provider)));
		store.add(this._languageModelsService.registerLanguageModelProvider(vendor, modelProvider));
		modelProvider.updateModels(agent.models);

		// Re-authenticate when credentials change
		store.add(this._defaultAccountService.onDidChangeDefaultAccount(() => {
			const agents = this._getRootAgents();
			this._authenticateWithServer(agents).catch(() => { /* best-effort */ });
		}));
		store.add(this._authenticationService.onDidChangeSessions(() => {
			const agents = this._getRootAgents();
			this._authenticateWithServer(agents).catch(() => { /* best-effort */ });
		}));
	}

	private _getRootAgents(): readonly AgentInfo[] {
		const rootState = this._agentHostService.rootState.value;
		return (rootState && !(rootState instanceof Error)) ? rootState.agents : [];
	}

	private _syncQuantumIDEOpenAIAgentConfig(): void {
		const routes = this._withBuiltInRouteToggles(sanitizeQuantumIDEModelRoutes(
			this._configurationService.getValue<unknown>(QuantumIDEAISettingId.ModelRouterRoutes),
			defaultQuantumIDEModelRoutes,
		));
		const coalesceMs = this._configurationService.getValue<number>(QuantumIDEAISettingId.OpenAIStreamingCoalesceMs);
		const maxToolIterations = this._configurationService.getValue<number>(QuantumIDEAISettingId.AgentMaxToolIterations);
		const maxActivitySteps = this._configurationService.getValue<number>(QuantumIDEAISettingId.AgentMaxActivityStepsPerTurn);
		const activityVerbosity = this._configurationService.getValue<string>(QuantumIDEAISettingId.AgentActivityVerbosity);
		const velocityProfile = this._configurationService.getValue<string>(QuantumIDEAISettingId.AgentVelocityProfile);
		this._loggedConnection?.dispatch({
			type: ActionType.RootConfigChanged,
			config: {
				[QuantumIDEModelRouterConfigKey]: routes,
				[QuantumIDEAISettingId.OpenAIStreamingEnabled]: this._configurationService.getValue<boolean>(QuantumIDEAISettingId.OpenAIStreamingEnabled) !== false,
				[QuantumIDEAISettingId.OpenAIStreamingCoalesceMs]: typeof coalesceMs === 'number' ? coalesceMs : 24,
				[QuantumIDEAISettingId.OpenAIStreamingAdaptiveCoalescing]: this._configurationService.getValue<boolean>(QuantumIDEAISettingId.OpenAIStreamingAdaptiveCoalescing) !== false,
				[QuantumIDEAISettingId.AgentMaxToolIterations]: typeof maxToolIterations === 'number' ? maxToolIterations : 8,
				[QuantumIDEAISettingId.AgentIterateUntilComplete]: this._configurationService.getValue<boolean>(QuantumIDEAISettingId.AgentIterateUntilComplete) !== false,
				[QuantumIDEAISettingId.AgentIterateUntilCompleteMaxContinuations]: this._configurationService.getValue<number>(QuantumIDEAISettingId.AgentIterateUntilCompleteMaxContinuations) ?? 3,
				[QuantumIDEAISettingId.AgentMaxActivityStepsPerTurn]: typeof maxActivitySteps === 'number' ? maxActivitySteps : 50,
				[QuantumIDEAISettingId.AgentActivityVerbosity]: activityVerbosity === 'minimal' || activityVerbosity === 'verbose' ? activityVerbosity : 'normal',
				[QuantumIDEAISettingId.AgentVelocityProfile]: velocityProfile === 'ship' ? 'ship' : 'dev',
				[QuantumIDEAISettingId.AgentVelocityParallelHostTools]: this._configurationService.getValue<boolean>(QuantumIDEAISettingId.AgentVelocityParallelHostTools) !== false,
				[QuantumIDEAISettingId.AgentVelocityCrossRootSearch]: this._configurationService.getValue<boolean>(QuantumIDEAISettingId.AgentVelocityCrossRootSearch) !== false,
				[QuantumIDEAISettingId.AgentVelocityHandoffEnabled]: this._configurationService.getValue<boolean>(QuantumIDEAISettingId.AgentVelocityHandoffEnabled) !== false,
			},
		});
	}

	private _withBuiltInRouteToggles(routes: ReturnType<typeof sanitizeQuantumIDEModelRoutes>): ReturnType<typeof sanitizeQuantumIDEModelRoutes> {
		const toggles = new Map<string, boolean>([
			['openai.gpt-4.1', this._configurationService.getValue<boolean>(QuantumIDEAISettingId.OpenAIGPT41Enabled) !== false],
			['openai.gpt-4.1-mini', this._configurationService.getValue<boolean>(QuantumIDEAISettingId.OpenAIGPT41MiniEnabled) !== false],
			['openai.gpt-4o', this._configurationService.getValue<boolean>(QuantumIDEAISettingId.OpenAIGPT4oEnabled) !== false],
		]);
		return routes.map(route => toggles.has(route.id) ? { ...route, enabled: toggles.get(route.id) } : route);
	}

	/**
	 * Authenticate using protectedResources from agent info in root state.
	 * Resolves tokens via the standard VS Code authentication service.
	 */
	private async _authenticateWithServer(agents: readonly AgentInfo[]): Promise<void> {
		this._agentHostService.setAuthenticationPending(true);
		try {
			await authenticateProtectedResources(agents, {
				authTokenCache: this._authTokenCache,
				authenticationService: this._authenticationService,
				secretStorageService: this._secretStorageService,
				logPrefix: '[AgentHost]',
				logService: this._logService,
				authenticate: request => this._loggedConnection!.authenticate(request),
			});
		} catch (err) {
			this._logService.error('[AgentHost] Failed to authenticate with server', err);
			this._loggedConnection!.logError('authenticateWithServer', err);
		} finally {
			this._agentHostService.setAuthenticationPending(false);
		}
	}

	/**
	 * Interactively prompt the user to authenticate when the server requires it.
	 * Uses protectedResources from root state, resolves the auth provider,
	 * creates a session (which triggers the login UI), and pushes the token
	 * to the server. Returns true if authentication succeeded.
	 */
	private async _resolveAuthenticationInteractively(protectedResources: ProtectedResourceMetadata[]): Promise<boolean> {
		try {
			if (isQuantumIDEProduct && protectedResources.some(resource => resource.resource === QuantumIDEOpenAIProtectedResourceId)) {
				return await this._resolveQuantumIDEOpenAIAuthentication();
			}
			return await resolveAuthenticationInteractively(protectedResources, {
				authTokenCache: this._authTokenCache,
				authenticationService: this._authenticationService,
				secretStorageService: this._secretStorageService,
				logPrefix: '[AgentHost]',
				logService: this._logService,
				authenticate: request => this._loggedConnection!.authenticate(request),
			});
		} catch (err) {
			this._logService.error('[AgentHost] Interactive authentication failed', err);
			this._loggedConnection!.logError('resolveAuthenticationInteractively', err);
		}
		return false;
	}

	private async _resolveQuantumIDEOpenAIAuthentication(): Promise<boolean> {
		const existingSecret = await this._secretStorageService.get(QuantumIDEOpenAIApiKeySecretStorageKey);
		if (existingSecret) {
			const authenticated = await this._loggedConnection!.authenticate({ resource: QuantumIDEOpenAIProtectedResourceId, token: existingSecret });
			this._authTokenCache.updateAndIsChanged(QuantumIDEOpenAIProtectedResourceId, existingSecret);
			return !!authenticated.authenticated;
		}

		const apiKey = await this._quickInputService.input({
			title: localize('quantumide.openai.auth.title', 'Connect QuantumIDE to OpenAI'),
			placeHolder: localize('quantumide.openai.auth.placeholder', 'Enter your OpenAI-compatible API key'),
			password: true,
			ignoreFocusLost: true,
			prompt: localize('quantumide.openai.auth.prompt', 'QuantumIDE needs an OpenAI-compatible API key before it can start this chat session. The key is stored in Secret Storage, not settings.json.'),
			validateInput: async value => {
				const trimmed = value.trim();
				if (!trimmed) {
					return localize('quantumide.openai.auth.required', 'Enter an API key or press Escape to cancel.');
				}
				if (/\s/.test(trimmed)) {
					return localize('quantumide.openai.auth.noWhitespace', 'API keys cannot contain spaces or newlines.');
				}
				if (trimmed.length < 20) {
					return localize('quantumide.openai.auth.tooShort', 'This key looks too short for an OpenAI-compatible API key.');
				}
				return undefined;
			},
		});
		if (!apiKey) {
			return false;
		}

		const token = apiKey.trim();
		const result = await this._loggedConnection!.authenticate({ resource: QuantumIDEOpenAIProtectedResourceId, token });
		if (!result.authenticated) {
			this._authTokenCache.clear(QuantumIDEOpenAIProtectedResourceId);
			this._notificationService.error(localize('quantumide.openai.auth.rejected', 'OpenAI authentication failed. Check the API key, base URL, quota, and model access.'));
			return false;
		}

		await this._secretStorageService.set(QuantumIDEOpenAIApiKeySecretStorageKey, token);
		await this._configurationService.updateValue(QuantumIDEAISettingId.OpenAIApiKeyStorage, 'secretStorage');
		this._authTokenCache.updateAndIsChanged(QuantumIDEOpenAIProtectedResourceId, token);
		this._notificationService.info(localize('quantumide.openai.auth.saved', 'OpenAI API key saved. Starting QuantumIDE chat session...'));
		return true;
	}
}
