/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { OpenAIChatStreamChunkKind, OpenAIClient, OpenAIStreamNotSupportedError } from '../../node/openai/openAiClient.js';

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

	test('streams text deltas and final completion payload', async () => {
		const encoder = new TextEncoder();
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n'));
				controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"lo"}}]}\n\n'));
				controller.enqueue(encoder.encode('data: [DONE]\n\n'));
				controller.close();
			},
		});
		globalThis.fetch = async () => new Response(stream, {
			status: 200,
			headers: { 'Content-Type': 'text/event-stream' },
		});

		const chunks = [];
		for await (const chunk of new OpenAIClient('https://api.openai.com/v1', 'key').chatStream({
			model: 'gpt-4.1',
			messages: [{ role: 'user', content: 'hello' }],
		})) {
			chunks.push(chunk);
		}

		const textChunks = chunks.filter(chunk => chunk.kind === OpenAIChatStreamChunkKind.Text);
		assert.strictEqual(textChunks.map(chunk => chunk.content).join(''), 'Hello');
		const done = chunks.at(-1);
		assert.strictEqual(done?.kind, OpenAIChatStreamChunkKind.Done);
		if (done?.kind === OpenAIChatStreamChunkKind.Done) {
			assert.strictEqual(done.text, 'Hello');
		}
	});

	test('parses SSE chunks split across reads', async () => {
		const encoder = new TextEncoder();
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"a"}}]}\n'));
				controller.enqueue(encoder.encode('\ndata: {"choices":[{"delta":{"content":"b"}}]}\n\n'));
				controller.enqueue(encoder.encode('data: [DONE]\n\n'));
				controller.close();
			},
		});
		globalThis.fetch = async () => new Response(stream, {
			status: 200,
			headers: { 'Content-Type': 'text/event-stream' },
		});

		const text = [];
		for await (const chunk of new OpenAIClient('https://api.openai.com/v1', 'key').chatStream({
			model: 'gpt-4.1',
			messages: [{ role: 'user', content: 'hello' }],
		})) {
			if (chunk.kind === OpenAIChatStreamChunkKind.Text) {
				text.push(chunk.content);
			}
		}
		assert.strictEqual(text.join(''), 'ab');
	});

	test('streams reasoning_content deltas when provided by the endpoint', async () => {
		const encoder = new TextEncoder();
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"reasoning_content":"Plan"}}]}\n\n'));
				controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"reasoning_content":" steps"}}]}\n\n'));
				controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Answer"}}]}\n\n'));
				controller.enqueue(encoder.encode('data: [DONE]\n\n'));
				controller.close();
			},
		});
		globalThis.fetch = async () => new Response(stream, {
			status: 200,
			headers: { 'Content-Type': 'text/event-stream' },
		});

		const chunks = [];
		for await (const chunk of new OpenAIClient('https://api.openai.com/v1', 'key').chatStream({
			model: 'gpt-4.1',
			messages: [{ role: 'user', content: 'hello' }],
		})) {
			chunks.push(chunk);
		}

		const reasoning = chunks.filter(chunk => chunk.kind === OpenAIChatStreamChunkKind.Reasoning).map(chunk => chunk.content).join('');
		assert.strictEqual(reasoning, 'Plan steps');
	});

	test('assembles streamed tool call arguments', async () => {
		const encoder = new TextEncoder();
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"read_file","arguments":"{\\"path\\":"}}]}}]}\n\n'));
				controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"/tmp/x\\"}"}}]}}]}\n\n'));
				controller.enqueue(encoder.encode('data: [DONE]\n\n'));
				controller.close();
			},
		});
		globalThis.fetch = async () => new Response(stream, {
			status: 200,
			headers: { 'Content-Type': 'text/event-stream' },
		});

		let done;
		for await (const chunk of new OpenAIClient('https://api.openai.com/v1', 'key').chatStream({
			model: 'gpt-4.1',
			messages: [{ role: 'user', content: 'hello' }],
		})) {
			if (chunk.kind === OpenAIChatStreamChunkKind.Done) {
				done = chunk;
			}
		}

		assert.ok(done);
		if (done?.kind === OpenAIChatStreamChunkKind.Done) {
			assert.strictEqual(done.toolCalls?.length, 1);
			assert.strictEqual(done.toolCalls?.[0]?.name, 'read_file');
			assert.strictEqual(done.toolCalls?.[0]?.arguments, '{"path":"/tmp/x"}');
		}
	});

	test('falls back when a streaming endpoint returns JSON', async () => {
		globalThis.fetch = async () => new Response(JSON.stringify({
			choices: [{ message: { content: 'buffered answer' } }],
			usage: { prompt_tokens: 1, completion_tokens: 2 },
		}), { status: 200, headers: { 'Content-Type': 'application/json' } });

		const chunks = [];
		for await (const chunk of new OpenAIClient('https://api.openai.com/v1', 'key').chatStream({
			model: 'gpt-4.1',
			messages: [{ role: 'user', content: 'hello' }],
		})) {
			chunks.push(chunk);
		}

		assert.strictEqual(chunks.some(chunk => chunk.kind === OpenAIChatStreamChunkKind.Text && chunk.content === 'buffered answer'), true);
		const done = chunks.at(-1);
		assert.strictEqual(done?.kind, OpenAIChatStreamChunkKind.Done);
		if (done?.kind === OpenAIChatStreamChunkKind.Done) {
			assert.strictEqual(done.text, 'buffered answer');
			assert.strictEqual(done.inputTokens, 1);
			assert.strictEqual(done.outputTokens, 2);
		}
	});

	test('announces tool call names while streaming', async () => {
		const encoder = new TextEncoder();
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"read_file","arguments":""}}]}}]}\n\n'));
				controller.enqueue(encoder.encode('data: [DONE]\n\n'));
				controller.close();
			},
		});
		globalThis.fetch = async () => new Response(stream, {
			status: 200,
			headers: { 'Content-Type': 'text/event-stream' },
		});

		const chunks = [];
		for await (const chunk of new OpenAIClient('https://api.openai.com/v1', 'key').chatStream({
			model: 'gpt-4.1',
			messages: [{ role: 'user', content: 'hello' }],
		})) {
			chunks.push(chunk);
		}

		const toolChunk = chunks.find(chunk => chunk.kind === OpenAIChatStreamChunkKind.ToolCallName);
		assert.ok(toolChunk);
		if (toolChunk?.kind === OpenAIChatStreamChunkKind.ToolCallName) {
			assert.strictEqual(toolChunk.name, 'read_file');
			assert.strictEqual(toolChunk.index, 0);
		}
	});

	test('throws OpenAIStreamNotSupportedError for stream rejection', async () => {
		globalThis.fetch = async () => new Response(JSON.stringify({
			error: { message: 'stream is not supported for this model' },
		}), { status: 400, headers: { 'Content-Type': 'application/json' } });

		await assert.rejects(
			async () => {
				for await (const _chunk of new OpenAIClient('https://api.openai.com/v1', 'key').chatStream({
					model: 'gpt-4.1',
					messages: [{ role: 'user', content: 'hello' }],
				})) {
					// consume
				}
			},
			(error: unknown) => error instanceof OpenAIStreamNotSupportedError,
		);
	});
});
