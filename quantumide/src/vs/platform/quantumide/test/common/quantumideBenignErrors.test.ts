/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { isBenignQuantumIDERendererError } from '../../common/quantumideBenignErrors.js';

suite('quantumideBenignErrors', () => {
	test('treats ResizeObserver loop as benign', () => {
		assert.strictEqual(
			isBenignQuantumIDERendererError('ResizeObserver loop completed with undelivered notifications.'),
			true,
		);
	});

	test('treats script error as benign', () => {
		assert.strictEqual(isBenignQuantumIDERendererError('Script error.'), true);
	});

	test('does not treat real errors as benign', () => {
		assert.strictEqual(isBenignQuantumIDERendererError('Failed to save workspace session.'), false);
	});
});
