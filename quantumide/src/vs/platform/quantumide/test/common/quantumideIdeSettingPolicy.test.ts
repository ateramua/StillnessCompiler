/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { isAgentWritableSettingKey, isValidMarketplaceExtensionId } from '../../common/quantumideIdeSettingPolicy.js';

suite('QuantumIDE IDE setting policy', () => {
	test('isAgentWritableSettingKey', () => {
		assert.strictEqual(isAgentWritableSettingKey('quantumide.ai.agent.autoApplyEdits'), true);
		assert.strictEqual(isAgentWritableSettingKey('editor.fontSize'), true);
		assert.strictEqual(isAgentWritableSettingKey('chat.experimental'), true);
		assert.strictEqual(isAgentWritableSettingKey('terminal.integrated.shell'), false);
		assert.strictEqual(isAgentWritableSettingKey(''), false);
	});

	test('isValidMarketplaceExtensionId', () => {
		assert.strictEqual(isValidMarketplaceExtensionId('ms-python.python'), true);
		assert.strictEqual(isValidMarketplaceExtensionId('../evil'), false);
		assert.strictEqual(isValidMarketplaceExtensionId(''), false);
	});
});
