/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { OpenAIClient } from '../../node/openai/openAiClient.js';

suite('OpenAIClient', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const originalFetch = globalThis.fetch;

	teardown(() => {
		globalThis.fetch = originalFetch;
	});

	test('returns assistant text and token usage', async () => {
		globalThis.fetch = async () => new Response(JSON.stringify({
			choices: [{ message: { content: 'hello from openai' } }],
			usage: { prompt_tokens: 3, completion_tokens: 4 },
		}), { status: 200, headers: { 'Content-Type': 'application/json' } });

		const result = await new OpenAIClient('https://api.openai.com/v1', 'key').chat({
			model: 'gpt-4.1',
			messages: [{ role: 'user', content: 'hello' }],
		});

		assert.strictEqual(result.text, 'hello from openai');
		assert.strictEqual(result.inputTokens, 3);
		assert.strictEqual(result.outputTokens, 4);
	});

	test('surfaces invalid API key errors clearly', async () => {
		globalThis.fetch = async () => new Response(JSON.stringify({
			error: { message: 'Incorrect API key provided' },
		}), { status: 401, headers: { 'Content-Type': 'application/json' } });

		await assert.rejects(
			() => new OpenAIClient('https://api.openai.com/v1', 'bad-key').chat({
				model: 'gpt-4.1',
				messages: [{ role: 'user', content: 'hello' }],
			}),
			/Incorrect API key provided/,
		);
	});

	test('lists sanitized OpenAI-compatible models', async () => {
		globalThis.fetch = async () => new Response(JSON.stringify({
			data: [
				{ id: 'gpt-4.1' },
				{ id: ' gpt-4o ' },
				{ id: 'gpt-4.1' },
				{ id: '' },
				{},
			],
		}), { status: 200, headers: { 'Content-Type': 'application/json' } });

		const result = await new OpenAIClient('https://api.openai.com/v1', 'key').listModels();

		assert.deepStrictEqual(result, [
			{ id: 'gpt-4.1' },
			{ id: 'gpt-4o' },
		]);
	});

	test('surfaces model listing auth errors clearly', async () => {
		globalThis.fetch = async () => new Response(JSON.stringify({
			error: { message: 'Invalid bearer token' },
		}), { status: 401, headers: { 'Content-Type': 'application/json' } });

		await assert.rejects(
			() => new OpenAIClient('https://api.openai.com/v1', 'bad-key').listModels(),
			/Invalid bearer token/,
		);
	});

	test('times out when fetch does not settle', async () => {
		globalThis.fetch = (_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
			init?.signal?.addEventListener('abort', () => {
				const error = new Error('aborted');
				error.name = 'AbortError';
				reject(error);
			});
		});

		await assert.rejects(
			() => new OpenAIClient('https://api.openai.com/v1', 'key').chat({
				model: 'gpt-4.1',
				messages: [{ role: 'user', content: 'hello' }],
				timeoutMs: 10,
			}),
			/OpenAI request timed out after 10ms/,
		);
	});
});
