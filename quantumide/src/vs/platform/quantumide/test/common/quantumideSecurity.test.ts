/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import {
	isDangerousQuantumIDETerminalCommand,
	isQuantumIDEAgentWritePathAllowed,
	isQuantumIDEPathExcluded,
} from '../../common/quantumideSecurity.js';

suite('QuantumIDE security', () => {
	test('detects dangerous terminal commands', () => {
		assert.strictEqual(isDangerousQuantumIDETerminalCommand('sudo rm -rf /'), true);
		assert.strictEqual(isDangerousQuantumIDETerminalCommand('npm test', false), false);
	});

	test('blocks writes outside workspace', () => {
		const root = URI.file('/workspace');
		const outside = URI.file('/etc/passwd');
		assert.strictEqual(isQuantumIDEAgentWritePathAllowed(root, outside, undefined), false);
	});

	test('respects excluded paths', () => {
		assert.strictEqual(isQuantumIDEPathExcluded('secrets/api.key', ['secrets']), true);
	});
});
