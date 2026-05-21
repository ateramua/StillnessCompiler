/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { QuantumIDEPlatformLayer, QUANTUMIDE_PLATFORM_LAYERS } from '../../common/quantumideLayers.js';

suite('QuantumIDE platform layers', () => {
	test('defines all seven architecture layers', () => {
		assert.strictEqual(QUANTUMIDE_PLATFORM_LAYERS.length, 7);
		const ids = new Set(QUANTUMIDE_PLATFORM_LAYERS.map(l => l.id));
		assert.ok(ids.has(QuantumIDEPlatformLayer.UI));
		assert.ok(ids.has(QuantumIDEPlatformLayer.ModelGateway));
	});
});
