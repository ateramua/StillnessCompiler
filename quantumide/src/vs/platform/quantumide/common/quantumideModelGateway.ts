/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import {
	defaultQuantumIDEModelRoutes,
	resolveQuantumIDEModelRoute,
	type IQuantumIDEModelRoute,
	type QuantumIDEModelTaskKind,
} from './quantumideModelRouter.js';

export interface IQuantumIDEModelGatewayRequest {
	readonly routes: unknown;
	readonly preferredRouteId?: string;
	readonly task?: QuantumIDEModelTaskKind | string;
	readonly taskRoutes?: Record<string, string>;
	readonly fallbackRouteId?: string;
}

export function resolveQuantumIDEModelGatewayRoute(request: IQuantumIDEModelGatewayRequest): IQuantumIDEModelRoute | undefined {
	return resolveQuantumIDEModelRoute(request.routes ?? defaultQuantumIDEModelRoutes, {
		preferredRouteId: request.preferredRouteId,
		task: request.task,
		taskRoutes: request.taskRoutes,
		fallbackRouteId: request.fallbackRouteId,
	});
}
