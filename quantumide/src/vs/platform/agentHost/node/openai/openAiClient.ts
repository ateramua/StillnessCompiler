/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

export interface IOpenAIMessage {
	readonly role: 'system' | 'user' | 'assistant';
	readonly content: string;
}

export interface IOpenAIToolDefinition {
	readonly type: 'function';
	readonly function: {
		readonly name: string;
		readonly description: string;
		readonly parameters: Record<string, unknown>;
	};
}

export interface IOpenAIToolCall {
	readonly id: string;
	readonly name: string;
	readonly arguments: string;
}

export interface IOpenAIChatRequest {
	readonly model: string;
	readonly messages: readonly IOpenAIMessage[];
	readonly temperature?: number;
	readonly tools?: readonly IOpenAIToolDefinition[];
	readonly signal?: AbortSignal;
	readonly timeoutMs?: number;
	readonly stream?: boolean;
}

export interface IOpenAIChatResponse {
	readonly text: string;
	readonly toolCalls?: readonly IOpenAIToolCall[];
	readonly inputTokens?: number;
	readonly outputTokens?: number;
}

export const enum OpenAIChatStreamChunkKind {
	Text = 'text',
	Reasoning = 'reasoning',
	ToolCallName = 'tool_call_name',
	Usage = 'usage',
	Done = 'done',
}

export interface IOpenAIChatStreamTextChunk {
	readonly kind: OpenAIChatStreamChunkKind.Text;
	readonly content: string;
}

export interface IOpenAIChatStreamReasoningChunk {
	readonly kind: OpenAIChatStreamChunkKind.Reasoning;
	readonly content: string;
}

export interface IOpenAIChatStreamToolCallNameChunk {
	readonly kind: OpenAIChatStreamChunkKind.ToolCallName;
	readonly index: number;
	readonly id?: string;
	readonly name: string;
}

export interface IOpenAIChatStreamUsageChunk {
	readonly kind: OpenAIChatStreamChunkKind.Usage;
	readonly inputTokens?: number;
	readonly outputTokens?: number;
}

export interface IOpenAIChatStreamDoneChunk {
	readonly kind: OpenAIChatStreamChunkKind.Done;
	readonly text: string;
	readonly toolCalls?: readonly IOpenAIToolCall[];
	readonly inputTokens?: number;
	readonly outputTokens?: number;
}

export type IOpenAIChatStreamChunk = IOpenAIChatStreamTextChunk | IOpenAIChatStreamReasoningChunk | IOpenAIChatStreamToolCallNameChunk | IOpenAIChatStreamUsageChunk | IOpenAIChatStreamDoneChunk;

export class OpenAIStreamNotSupportedError extends Error {
	constructor(message = 'OpenAI-compatible endpoint does not support streaming chat completions.') {
		super(message);
		this.name = 'OpenAIStreamNotSupportedError';
	}
}

export interface IOpenAIListModelsRequest {
	readonly signal?: AbortSignal;
	readonly timeoutMs?: number;
}

export interface IOpenAIModelInfo {
	readonly id: string;
}

interface IOpenAIModelListResponse {
	readonly data?: readonly {
		readonly id?: string;
	}[];
	readonly error?: {
		readonly message?: string;
	};
}

interface IOpenAIChatChoice {
	readonly message?: {
		readonly content?: string | null;
		readonly tool_calls?: readonly IOpenAIStreamToolCall[];
	};
	readonly delta?: {
		readonly content?: string | null;
		readonly reasoning_content?: string | null;
		readonly reasoning?: string | null;
		readonly tool_calls?: readonly IOpenAIStreamToolCall[];
	};
	readonly finish_reason?: string | null;
}

interface IOpenAIStreamToolCall {
	readonly index?: number;
	readonly id?: string;
	readonly type?: string;
	readonly function?: {
		readonly name?: string;
		readonly arguments?: string;
	};
}

interface IOpenAIChatCompletionResponse {
	readonly choices?: readonly IOpenAIChatChoice[];
	readonly usage?: {
		readonly prompt_tokens?: number;
		readonly completion_tokens?: number;
	};
	readonly error?: {
		readonly message?: string;
	};
}

const DEFAULT_OPENAI_REQUEST_TIMEOUT_MS = 60_000;

export class OpenAIClient {
	constructor(
		private readonly baseUrl: string,
		private readonly apiKey: string,
	) { }

	get endpointBaseUrl(): string {
		return this.baseUrl.replace(/\/+$/, '');
	}

	async chat(request: IOpenAIChatRequest): Promise<IOpenAIChatResponse> {
		const response = await this._postChatCompletion(request, false);
		const body = await this._readJsonBody(response);
		if (!response.ok) {
			throw new Error(this._formatError(response.status, body));
		}

		const message = body.choices?.[0]?.message;
		const text = message?.content ?? '';
		const toolCalls = this._normalizeToolCalls(message?.tool_calls);
		if (!text && (!toolCalls || toolCalls.length === 0)) {
			throw new Error('OpenAI-compatible response did not include assistant text or tool calls.');
		}

		return {
			text,
			toolCalls,
			inputTokens: body.usage?.prompt_tokens,
			outputTokens: body.usage?.completion_tokens,
		};
	}

	async *chatStream(request: IOpenAIChatRequest): AsyncGenerator<IOpenAIChatStreamChunk> {
		const response = await this._postChatCompletion(request, true);
		const contentType = response.headers.get('content-type') ?? '';
		if (!response.ok) {
			const body = await this._readJsonBody(response);
			const message = this._formatError(response.status, body);
			if (response.status === 400 && /stream/i.test(message)) {
				throw new OpenAIStreamNotSupportedError(message);
			}
			throw new Error(message);
		}

		if (!contentType.includes('text/event-stream')) {
			const body = await this._readJsonBody(response);
			const message = body.choices?.[0]?.message;
			const text = message?.content ?? '';
			const toolCalls = this._normalizeToolCalls(message?.tool_calls);
			if (text) {
				yield { kind: OpenAIChatStreamChunkKind.Text, content: text };
			}
			yield {
				kind: OpenAIChatStreamChunkKind.Done,
				text,
				toolCalls,
				inputTokens: body.usage?.prompt_tokens,
				outputTokens: body.usage?.completion_tokens,
			};
			return;
		}

		if (!response.body) {
			throw new Error('OpenAI-compatible streaming response did not include a body.');
		}

		let text = '';
		const toolCallBuilders = new Map<number, { id?: string; name?: string; arguments: string }>();
		const announcedToolNames = new Set<number>();
		let inputTokens: number | undefined;
		let outputTokens: number | undefined;

		for await (const data of this._readOpenAISse(response.body, request.signal)) {
			if (data === '[DONE]') {
				break;
			}
			let parsed: IOpenAIChatCompletionResponse;
			try {
				parsed = JSON.parse(data) as IOpenAIChatCompletionResponse;
			} catch {
				continue;
			}
			if (parsed.error?.message) {
				throw new Error(parsed.error.message);
			}
			if (parsed.usage) {
				inputTokens = parsed.usage.prompt_tokens ?? inputTokens;
				outputTokens = parsed.usage.completion_tokens ?? outputTokens;
				yield {
					kind: OpenAIChatStreamChunkKind.Usage,
					inputTokens,
					outputTokens,
				};
			}
			const choice = parsed.choices?.[0];
			if (!choice) {
				continue;
			}
			const deltaContent = choice.delta?.content;
			if (typeof deltaContent === 'string' && deltaContent.length > 0) {
				text += deltaContent;
				yield { kind: OpenAIChatStreamChunkKind.Text, content: deltaContent };
			}
			const reasoningDelta = choice.delta?.reasoning_content ?? choice.delta?.reasoning;
			if (typeof reasoningDelta === 'string' && reasoningDelta.length > 0) {
				yield { kind: OpenAIChatStreamChunkKind.Reasoning, content: reasoningDelta };
			}
			for (const toolDelta of choice.delta?.tool_calls ?? []) {
				const index = toolDelta.index ?? 0;
				let builder = toolCallBuilders.get(index);
				if (!builder) {
					builder = { arguments: '' };
					toolCallBuilders.set(index, builder);
				}
				if (toolDelta.id) {
					builder.id = toolDelta.id;
				}
				if (toolDelta.function?.name) {
					builder.name = toolDelta.function.name;
					if (!announcedToolNames.has(index)) {
						announcedToolNames.add(index);
						yield {
							kind: OpenAIChatStreamChunkKind.ToolCallName,
							index,
							id: builder.id,
							name: builder.name,
						};
					}
				}
				if (toolDelta.function?.arguments) {
					builder.arguments += toolDelta.function.arguments;
				}
			}
		}

		const toolCalls = [...toolCallBuilders.entries()]
			.sort(([left], [right]) => left - right)
			.map(([, builder]) => builder)
			.filter(builder => builder.name)
			.map(builder => ({
				id: builder.id ?? `openai-tool-${Math.random().toString(36).slice(2)}`,
				name: builder.name!,
				arguments: builder.arguments || '{}',
			}));

		if (!text && toolCalls.length === 0) {
			throw new Error('OpenAI-compatible stream did not include assistant text or tool calls.');
		}

		yield {
			kind: OpenAIChatStreamChunkKind.Done,
			text,
			toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
			inputTokens,
			outputTokens,
		};
	}

	async listModels(request: IOpenAIListModelsRequest = {}): Promise<readonly IOpenAIModelInfo[]> {
		const endpoint = `${this.baseUrl.replace(/\/+$/, '')}/models`;
		const timeoutController = new AbortController();
		const timeoutMs = request.timeoutMs ?? DEFAULT_OPENAI_REQUEST_TIMEOUT_MS;
		const timeoutHandle = setTimeout(() => timeoutController.abort(new Error(`OpenAI request timed out after ${timeoutMs}ms`)), timeoutMs);
		const abortListener = () => timeoutController.abort(request.signal?.reason);
		try {
			if (request.signal?.aborted) {
				timeoutController.abort(request.signal.reason);
			} else {
				request.signal?.addEventListener('abort', abortListener, { once: true });
			}

			const response = await fetch(endpoint, {
				method: 'GET',
				headers: {
					'Authorization': `Bearer ${this.apiKey}`,
				},
				signal: timeoutController.signal,
			});

			const body = await this._readJsonBody(response) as IOpenAIModelListResponse;
			if (!response.ok) {
				throw new Error(this._formatError(response.status, body));
			}

			return body.data
				?.map(model => typeof model.id === 'string' ? model.id.trim() : '')
				.filter((id, index, ids) => !!id && ids.indexOf(id) === index)
				.sort((left, right) => left.localeCompare(right))
				.map(id => ({ id })) ?? [];
		} catch (error) {
			if (error instanceof Error && error.name === 'AbortError') {
				throw new Error(request.signal?.aborted ? 'OpenAI model request was cancelled.' : `OpenAI request timed out after ${timeoutMs}ms.`);
			}
			throw error;
		} finally {
			clearTimeout(timeoutHandle);
			request.signal?.removeEventListener('abort', abortListener);
		}
	}

	private async _postChatCompletion(request: IOpenAIChatRequest, stream: boolean): Promise<Response> {
		const endpoint = `${this.baseUrl.replace(/\/+$/, '')}/chat/completions`;
		const timeoutController = new AbortController();
		const timeoutMs = request.timeoutMs ?? DEFAULT_OPENAI_REQUEST_TIMEOUT_MS;
		const timeoutHandle = setTimeout(() => timeoutController.abort(new Error(`OpenAI request timed out after ${timeoutMs}ms`)), timeoutMs);
		const abortListener = () => timeoutController.abort(request.signal?.reason);
		try {
			if (request.signal?.aborted) {
				timeoutController.abort(request.signal.reason);
			} else {
				request.signal?.addEventListener('abort', abortListener, { once: true });
			}

			return await fetch(endpoint, {
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${this.apiKey}`,
					'Content-Type': 'application/json',
					'Accept': stream ? 'text/event-stream' : 'application/json',
				},
				body: JSON.stringify({
					model: request.model,
					messages: request.messages,
					temperature: request.temperature,
					tools: request.tools,
					tool_choice: request.tools && request.tools.length > 0 ? 'auto' : undefined,
					stream,
				}),
				signal: timeoutController.signal,
			});
		} catch (error) {
			if (error instanceof Error && error.name === 'AbortError') {
				throw new Error(request.signal?.aborted ? 'OpenAI request was cancelled.' : `OpenAI request timed out after ${timeoutMs}ms.`);
			}
			throw error;
		} finally {
			clearTimeout(timeoutHandle);
			request.signal?.removeEventListener('abort', abortListener);
		}
	}

	private async *_readOpenAISse(body: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<string> {
		const reader = body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';
		try {
			while (true) {
				if (signal?.aborted) {
					const error = new Error('OpenAI request was cancelled.');
					error.name = 'AbortError';
					throw error;
				}
				const { done, value } = await reader.read();
				if (done) {
					break;
				}
				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() ?? '';
				for (const line of lines) {
					const data = this._parseSseDataLine(line);
					if (data !== undefined) {
						yield data;
					}
				}
			}
			if (buffer.trim()) {
				const data = this._parseSseDataLine(buffer);
				if (data !== undefined) {
					yield data;
				}
			}
		} finally {
			try {
				await reader.cancel();
			} catch {
				// best-effort cleanup
			}
			reader.releaseLock();
		}
	}

	private _parseSseDataLine(line: string): string | undefined {
		const trimmed = line.trim();
		if (!trimmed.startsWith('data:')) {
			return undefined;
		}
		const data = trimmed.slice('data:'.length).trim();
		return data.length > 0 ? data : undefined;
	}

	private _normalizeToolCalls(toolCalls: readonly IOpenAIStreamToolCall[] | undefined): readonly IOpenAIToolCall[] | undefined {
		return toolCalls
			?.filter(call => call.type === 'function' && call.function?.name)
			.map(call => ({
				id: call.id ?? `openai-tool-${Math.random().toString(36).slice(2)}`,
				name: call.function!.name!,
				arguments: call.function?.arguments ?? '{}',
			}));
	}

	private async _readJsonBody(response: Response): Promise<IOpenAIChatCompletionResponse> {
		try {
			return await response.json() as IOpenAIChatCompletionResponse;
		} catch {
			return {};
		}
	}

	private _formatError(status: number, body: IOpenAIChatCompletionResponse): string {
		const message = body.error?.message;
		if (status === 401) {
			return message ?? 'OpenAI rejected the API key. Check QUANTUMIDE_OPENAI_API_KEY or store a new key with QuantumIDE: Store OpenAI API Key.';
		}
		if (status === 403) {
			return message ?? 'OpenAI denied access for this API key or model.';
		}
		if (status === 404) {
			return message ?? 'OpenAI model or endpoint was not found. Check QUANTUMIDE_OPENAI_MODEL and QUANTUMIDE_OPENAI_BASE_URL.';
		}
		if (status === 429) {
			return message ?? 'OpenAI rate limit or quota was reached. Check billing, quota, or retry later.';
		}
		if (status >= 500) {
			return message ?? `OpenAI service error (${status}). Retry later or check the configured base URL.`;
		}
		return message ?? `OpenAI-compatible request failed with HTTP ${status}.`;
	}
}
