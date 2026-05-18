/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from '../../../../base/common/path.js';
import { tmpdir } from 'os';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { QuantumIDEOpenAIApiKeyEnvVar, QuantumIDEOpenAIBaseUrlEnvVar } from '../../common/quantumideAISettings.js';
import { readQuantumIDEEnvFiles } from '../../node/quantumideEnv.js';

suite('QuantumIDE .env loader', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	let tempDir: string;

	setup(() => {
		tempDir = mkdtempSync(join(tmpdir(), 'quantumide-env-test-'));
	});

	teardown(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	test('loads supported OpenAI keys from .env', () => {
		writeFileSync(join(tempDir, '.env'), [
			'QUANTUMIDE_OPENAI_API_KEY="test-key"',
			'QUANTUMIDE_OPENAI_BASE_URL=https://example.test/v1',
			'UNRELATED=value',
		].join('\n'));

		const env = readQuantumIDEEnvFiles([tempDir], {});

		assert.strictEqual(env[QuantumIDEOpenAIApiKeyEnvVar], 'test-key');
		assert.strictEqual(env[QuantumIDEOpenAIBaseUrlEnvVar], 'https://example.test/v1');
		assert.strictEqual(env['UNRELATED'], undefined);
	});

	test('does not override existing environment values', () => {
		writeFileSync(join(tempDir, '.env'), 'QUANTUMIDE_OPENAI_API_KEY=file-key\n');

		const env = readQuantumIDEEnvFiles([tempDir], { [QuantumIDEOpenAIApiKeyEnvVar]: 'existing-key' });

		assert.strictEqual(env[QuantumIDEOpenAIApiKeyEnvVar], undefined);
	});
});
