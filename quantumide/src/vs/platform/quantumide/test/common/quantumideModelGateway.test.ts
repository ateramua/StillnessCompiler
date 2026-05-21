/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { defaultQuantumIDEModelRoutes } from '../../common/quantumideModelRouter.js';
import { resolveQuantumIDEModelGatewayRoute } from '../../common/quantumideModelGateway.js';

suite('QuantumIDE model gateway', () => {
	test('resolves task-specific route', () => {
		const route = resolveQuantumIDEModelGatewayRoute({
			routes: defaultQuantumIDEModelRoutes,
			task: 'inline',
			taskRoutes: { inline: 'openai.gpt-4.1-mini' },
		});
		assert.strictEqual(route?.id, 'openai.gpt-4.1-mini');
	});

	test('falls back when preferred route missing', () => {
		const route = resolveQuantumIDEModelGatewayRoute({
			routes: defaultQuantumIDEModelRoutes,
			preferredRouteId: 'missing.route',
			fallbackRouteId: 'openai.gpt-4.1-mini',
		});
		assert.strictEqual(route?.id, 'openai.gpt-4.1-mini');
	});
});
