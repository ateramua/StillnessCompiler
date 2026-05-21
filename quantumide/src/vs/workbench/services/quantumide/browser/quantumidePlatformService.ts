/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { QuantumIDEAISettingId } from '../../../../platform/quantumide/common/quantumideAISettings.js';
import { QuantumIDEPlatformLayer, type IQuantumIDELayerHealth } from '../../../../platform/quantumide/common/quantumideLayers.js';
import { resolveQuantumIDEModelGatewayRoute } from '../../../../platform/quantumide/common/quantumideModelGateway.js';
import { QuantumIDEModelRouterConfigKey, type QuantumIDEModelTaskKind } from '../../../../platform/quantumide/common/quantumideModelRouter.js';
import {
	formatQuantumIDETechStackReport,
	getDefaultQuantumIDEDiffEngineAdapter,
	getDefaultQuantumIDEParserAdapter,
	getDefaultQuantumIDEStateStoreAdapter,
	getDefaultQuantumIDETransportAdapter,
	getDefaultQuantumIDEVectorStoreAdapter,
	type IQuantumIDEDiffEngineAdapter,
	type IQuantumIDEParserAdapter,
	type IQuantumIDEStateStoreAdapter,
	type IQuantumIDETransportAdapter,
	type IQuantumIDEVectorStoreAdapter,
} from '../../../../platform/quantumide/common/quantumideTechStackAdapters.js';
import {
	IQuantumIDEPlatformArchitectureReport,
	IQuantumIDEPlatformService,
} from '../common/quantumidePlatform.js';
import { IQuantumIDESemanticIndexService } from '../common/quantumideSemanticIndex.js';
export class QuantumIDEPlatformService extends Disposable implements IQuantumIDEPlatformService {
	declare readonly _serviceBrand: undefined;

	private readonly _parser = getDefaultQuantumIDEParserAdapter();
	private readonly _vectorStore = getDefaultQuantumIDEVectorStoreAdapter();
	private readonly _diffEngine = getDefaultQuantumIDEDiffEngineAdapter();
	private readonly _stateStore = getDefaultQuantumIDEStateStoreAdapter();
	private readonly _transport = getDefaultQuantumIDETransportAdapter();

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IQuantumIDESemanticIndexService private readonly _semanticIndexService: IQuantumIDESemanticIndexService,
	) {
		super();
		this._register(this._stateStore.onDidAppend(event => {
			this._transport.publish({
				channel: 'quantumide.state',
				layer: event.layer,
				payload: { kind: event.kind, sessionId: event.sessionId, ...event.payload },
			});
		}));
	}

	getParserAdapter(): IQuantumIDEParserAdapter {
		return this._parser;
	}

	getVectorStoreAdapter(): IQuantumIDEVectorStoreAdapter {
		return this._vectorStore;
	}

	getDiffEngineAdapter(): IQuantumIDEDiffEngineAdapter {
		return this._diffEngine;
	}

	getStateStore(): IQuantumIDEStateStoreAdapter {
		return this._stateStore;
	}

	getTransport(): IQuantumIDETransportAdapter {
		return this._transport;
	}

	recordLayerEvent(layer: QuantumIDEPlatformLayer, kind: string, sessionId: string, payload?: Record<string, unknown>): void {
		this._stateStore.append({
			sessionId,
			layer,
			kind,
			timestamp: Date.now(),
			payload,
		});
	}

	resolveModelRoute(preferredRouteId: string | undefined, task: QuantumIDEModelTaskKind = 'agent') {
		const routes = this._configurationService.getValue<unknown>(QuantumIDEModelRouterConfigKey);
		const taskRoutes = this._configurationService.getValue<Record<string, string>>(QuantumIDEAISettingId.ModelTaskRoutes);
		const fallbackRouteId = this._configurationService.getValue<string>(QuantumIDEAISettingId.ModelFallbackRoute);
		return resolveQuantumIDEModelGatewayRoute({
			routes,
			preferredRouteId,
			task,
			taskRoutes: taskRoutes ?? {},
			fallbackRouteId,
		});
	}

	async getLayerHealth(): Promise<readonly IQuantumIDELayerHealth[]> {
		const aiEnabled = this._configurationService.getValue<boolean>(QuantumIDEAISettingId.Enabled) !== false;
		const indexingEnabled = this._configurationService.getValue<boolean>(QuantumIDEAISettingId.IndexingEnabled) !== false;
		const semantic = this._semanticIndexService.getSemanticIndex();
		const vector = this._semanticIndexService.getVectorIndex();

		return [
			{
				layer: QuantumIDEPlatformLayer.UI,
				status: aiEnabled ? 'ready' : 'degraded',
				detail: aiEnabled ? 'Chat and settings surfaces available.' : 'QuantumIDE AI disabled in settings.',
			},
			{
				layer: QuantumIDEPlatformLayer.Context,
				status: indexingEnabled && semantic ? 'ready' : indexingEnabled ? 'degraded' : 'unavailable',
				detail: semantic
					? `Semantic index: ${semantic.documents.length} documents.`
					: indexingEnabled ? 'Index not built yet; will build on demand.' : 'Indexing disabled.',
			},
			{
				layer: QuantumIDEPlatformLayer.Agent,
				status: aiEnabled ? 'ready' : 'unavailable',
				detail: 'Agent host and OpenAI agent registered.',
			},
			{
				layer: QuantumIDEPlatformLayer.Execution,
				status: 'ready',
				detail: 'Integrated terminal and workspace check tools.',
			},
			{
				layer: QuantumIDEPlatformLayer.Diff,
				status: 'ready',
				detail: 'Inline diff, hunks, and side-by-side preview available.',
			},
			{
				layer: QuantumIDEPlatformLayer.Storage,
				status: semantic || vector ? 'ready' : 'degraded',
				detail: 'Transcripts, checkpoints, and `.quantumide` caches.',
			},
			{
				layer: QuantumIDEPlatformLayer.ModelGateway,
				status: this.resolveModelRoute(undefined, 'chat') ? 'ready' : 'degraded',
				detail: this.resolveModelRoute(undefined, 'chat')?.id ?? 'No enabled model routes.',
			},
		];
	}

	async getArchitectureReport(): Promise<IQuantumIDEPlatformArchitectureReport> {
		const layers = await this.getLayerHealth();
		const techStack = formatQuantumIDETechStackReport();
		const degraded = layers.filter(l => l.status !== 'ready').length;
		const summary = [
			`QuantumIDE platform: ${layers.length - degraded}/${layers.length} layers ready.`,
			`Parser: ${this._parser.id}, Vector: ${this._vectorStore.id}, Diff: ${this._diffEngine.id}`,
		].join('\n');
		return { layers, techStack, summary };
	}
}

registerSingleton(IQuantumIDEPlatformService, QuantumIDEPlatformService, InstantiationType.Delayed);
