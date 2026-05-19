/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

export interface IOpenAIStreamCoalescerOptions {
	readonly baseCoalesceMs: number;
	readonly maxCoalesceMs: number;
	readonly maxBurstChars: number;
	readonly adaptiveCoalescing?: boolean;
}

export interface IOpenAIStreamCoalescerMetrics {
	readonly deltaCount: number;
	readonly emittedCharCount: number;
	readonly timeToFirstEmitMs?: number;
	readonly effectiveCoalesceMs: number;
}

const DEFAULT_MAX_COALESCE_MS = 80;
const DEFAULT_MAX_BURST_CHARS = 512;
const MIN_BOOTSTRAP_MS = 250;

export function countWords(text: string): number {
	if (!text) {
		return 0;
	}
	return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Estimates a coalesce interval from recent word throughput so bursty providers
 * batch more aggressively while fast streams stay responsive.
 */
export function computeAdaptiveCoalesceMs(
	baseCoalesceMs: number,
	maxCoalesceMs: number,
	totalWords: number,
	elapsedMs: number,
	hasEmitted: boolean,
): number {
	if (baseCoalesceMs <= 0) {
		return 0;
	}
	if (!hasEmitted) {
		return baseCoalesceMs;
	}
	const effectiveElapsed = Math.max(elapsedMs, MIN_BOOTSTRAP_MS);
	const wordsPerSecond = totalWords / (effectiveElapsed / 1000);
	if (wordsPerSecond >= 40) {
		return Math.min(maxCoalesceMs, Math.max(baseCoalesceMs, 40));
	}
	if (wordsPerSecond >= 15) {
		return Math.min(maxCoalesceMs, Math.max(baseCoalesceMs, 28));
	}
	if (wordsPerSecond <= 4) {
		return Math.min(maxCoalesceMs, Math.max(baseCoalesceMs + 12, 36));
	}
	return baseCoalesceMs;
}

export class OpenAIStreamCoalescer {
	private _pending = '';
	private _flushTimer: ReturnType<typeof setTimeout> | undefined;
	private _startedAt = Date.now();
	private _totalWords = 0;
	private _deltaCount = 0;
	private _emittedCharCount = 0;
	private _timeToFirstEmitMs: number | undefined;
	private _hasEmitted = false;

	constructor(
		private readonly _onFlush: (content: string) => void,
		private readonly _options: IOpenAIStreamCoalescerOptions = {
			baseCoalesceMs: 24,
			maxCoalesceMs: DEFAULT_MAX_COALESCE_MS,
			maxBurstChars: DEFAULT_MAX_BURST_CHARS,
			adaptiveCoalescing: true,
		},
	) { }

	enqueue(content: string): void {
		if (!content) {
			return;
		}
		this._deltaCount++;
		this._totalWords += countWords(content);
		this._pending += content;
		const coalesceMs = this._getEffectiveCoalesceMs();
		if (this._pending.length >= this._options.maxBurstChars || coalesceMs <= 0) {
			this.flush();
			return;
		}
		this._scheduleFlush(coalesceMs);
	}

	flush(): void {
		if (this._flushTimer) {
			clearTimeout(this._flushTimer);
			this._flushTimer = undefined;
		}
		if (!this._pending) {
			return;
		}
		const chunk = this._pending;
		this._pending = '';
		if (this._timeToFirstEmitMs === undefined) {
			this._timeToFirstEmitMs = Date.now() - this._startedAt;
		}
		this._hasEmitted = true;
		this._emittedCharCount += chunk.length;
		this._onFlush(chunk);
	}

	dispose(): void {
		if (this._flushTimer) {
			clearTimeout(this._flushTimer);
			this._flushTimer = undefined;
		}
	}

	getMetrics(): IOpenAIStreamCoalescerMetrics {
		return {
			deltaCount: this._deltaCount,
			emittedCharCount: this._emittedCharCount,
			timeToFirstEmitMs: this._timeToFirstEmitMs,
			effectiveCoalesceMs: this._getEffectiveCoalesceMs(),
		};
	}

	private _getEffectiveCoalesceMs(): number {
		const base = Math.max(0, Math.min(this._options.baseCoalesceMs, this._options.maxCoalesceMs));
		if (!this._options.adaptiveCoalescing) {
			return base;
		}
		return computeAdaptiveCoalesceMs(
			base,
			this._options.maxCoalesceMs,
			this._totalWords,
			Date.now() - this._startedAt,
			this._hasEmitted,
		);
	}

	private _scheduleFlush(coalesceMs: number): void {
		if (this._flushTimer || coalesceMs <= 0) {
			return;
		}
		this._flushTimer = setTimeout(() => this.flush(), coalesceMs);
	}
}
