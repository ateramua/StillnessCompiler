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
}

export interface IOpenAIChatResponse {
	readonly text: string;
	readonly toolCalls?: readonly IOpenAIToolCall[];
	readonly inputTokens?: number;
	readonly outputTokens?: number;
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
		readonly tool_calls?: readonly {
			readonly id?: string;
			readonly type?: string;
			readonly function?: {
				readonly name?: string;
				readonly arguments?: string;
			};
		}[];
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

	async chat(request: IOpenAIChatRequest): Promise<IOpenAIChatResponse> {
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

			const response = await fetch(endpoint, {
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${this.apiKey}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					model: request.model,
					messages: request.messages,
					temperature: request.temperature,
					tools: request.tools,
					tool_choice: request.tools && request.tools.length > 0 ? 'auto' : undefined,
					stream: false,
				}),
				signal: timeoutController.signal,
			});

			const body = await this._readJsonBody(response);
			if (!response.ok) {
				throw new Error(this._formatError(response.status, body));
			}

			const message = body.choices?.[0]?.message;
			const text = message?.content ?? '';
			const toolCalls = message?.tool_calls
				?.filter(call => call.type === 'function' && call.function?.name)
				.map(call => ({
					id: call.id ?? `openai-tool-${Math.random().toString(36).slice(2)}`,
					name: call.function!.name!,
					arguments: call.function?.arguments ?? '{}',
				}));
			if (!text && (!toolCalls || toolCalls.length === 0)) {
				throw new Error('OpenAI-compatible response did not include assistant text or tool calls.');
			}

			return {
				text,
				toolCalls,
				inputTokens: body.usage?.prompt_tokens,
				outputTokens: body.usage?.completion_tokens,
			};
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
