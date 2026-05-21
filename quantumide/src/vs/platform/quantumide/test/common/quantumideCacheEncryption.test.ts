/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import {
	decryptQuantumIDEIndexPayload,
	encryptQuantumIDEIndexPayload,
	isEncryptedQuantumIDEIndexPayload,
} from '../../common/quantumideCacheEncryption.js';

suite('QuantumIDE cache encryption', () => {
	test('round-trips encrypted payloads', () => {
		const plain = '{"version":1,"documents":[]}';
		const encrypted = encryptQuantumIDEIndexPayload(plain, '/workspace/demo');
		assert.ok(isEncryptedQuantumIDEIndexPayload(encrypted));
		const decoded = decryptQuantumIDEIndexPayload(encrypted, '/workspace/demo');
		assert.strictEqual(decoded, plain);
	});
});
