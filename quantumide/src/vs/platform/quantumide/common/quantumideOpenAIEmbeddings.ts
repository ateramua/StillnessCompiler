/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/** OpenAI text-embedding-3-small dimension (§3.3). */
export const OPENAI_EMBEDDING_DIM = 1536;
const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';
const MAX_EMBED_CHARS = 24_000;

export interface IOpenAIEmbeddingRequest {
	readonly apiKey: string;
	readonly baseUrl: string;
	readonly texts: readonly string[];
	readonly model?: string;
	readonly signal?: AbortSignal;
}

export async function fetchOpenAIEmbeddings(request: IOpenAIEmbeddingRequest): Promise<Float32Array[]> {
	if (!request.apiKey || request.texts.length === 0) {
		return [];
	}
	const base = request.baseUrl.replace(/\/+$/, '');
	const url = `${base}/embeddings`;
	const inputs = request.texts.map(t => t.slice(0, MAX_EMBED_CHARS));
	const response = await fetch(url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${request.apiKey}`,
		},
		body: JSON.stringify({
			model: request.model ?? DEFAULT_EMBEDDING_MODEL,
			input: inputs,
		}),
		signal: request.signal,
	});
	const body = await response.json() as {
		data?: { embedding?: number[] }[];
		error?: { message?: string };
	};
	if (!response.ok) {
		throw new Error(body.error?.message ?? `OpenAI embeddings failed (${response.status})`);
	}
	const vectors: Float32Array[] = [];
	for (const item of body.data ?? []) {
		const raw = item.embedding ?? [];
		const vector = new Float32Array(raw.length);
		for (let i = 0; i < raw.length; i++) {
			vector[i] = raw[i];
		}
		normalize(vector);
		vectors.push(vector);
	}
	return vectors;
}

function normalize(vector: Float32Array): void {
	let sum = 0;
	for (let i = 0; i < vector.length; i++) {
		sum += vector[i] * vector[i];
	}
	const mag = Math.sqrt(sum);
	if (mag > 0) {
		for (let i = 0; i < vector.length; i++) {
			vector[i] /= mag;
		}
	}
}
