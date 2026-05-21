/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import type { IQuantumIDELayerHealth, QuantumIDEPlatformLayer } from '../../../../platform/quantumide/common/quantumideLayers.js';
import type {
	IQuantumIDEDiffEngineAdapter,
	IQuantumIDEParserAdapter,
	IQuantumIDEStateStoreAdapter,
	IQuantumIDETransportAdapter,
	IQuantumIDEVectorStoreAdapter,
} from '../../../../platform/quantumide/common/quantumideTechStackAdapters.js';
import type { IQuantumIDEModelRoute } from '../../../../platform/quantumide/common/quantumideModelRouter.js';
import type { QuantumIDEModelTaskKind } from '../../../../platform/quantumide/common/quantumideModelRouter.js';

export interface IQuantumIDEPlatformArchitectureReport {
	readonly layers: readonly IQuantumIDELayerHealth[];
	readonly techStack: string;
	readonly summary: string;
}

export interface IQuantumIDEPlatformService {
	readonly _serviceBrand: undefined;
	getLayerHealth(): Promise<readonly IQuantumIDELayerHealth[]>;
	getArchitectureReport(): Promise<IQuantumIDEPlatformArchitectureReport>;
	getParserAdapter(): IQuantumIDEParserAdapter;
	getVectorStoreAdapter(): IQuantumIDEVectorStoreAdapter;
	getDiffEngineAdapter(): IQuantumIDEDiffEngineAdapter;
	getStateStore(): IQuantumIDEStateStoreAdapter;
	getTransport(): IQuantumIDETransportAdapter;
	recordLayerEvent(layer: QuantumIDEPlatformLayer, kind: string, sessionId: string, payload?: Record<string, unknown>): void;
	resolveModelRoute(preferredRouteId: string | undefined, task?: QuantumIDEModelTaskKind): IQuantumIDEModelRoute | undefined;
}

export const IQuantumIDEPlatformService = createDecorator<IQuantumIDEPlatformService>('quantumIDEPlatformService');
