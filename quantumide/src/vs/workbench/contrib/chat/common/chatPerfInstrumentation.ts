/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { getMarks } from '../../../../base/common/performance.js';
import { URI } from '../../../../base/common/uri.js';
import { chatSessionResourceToId } from './model/chatUri.js';
import { ChatPerfMark } from './chatPerfMarks.js';

/**
 * Measurable slowness dimensions for the chat panel.
 * Map marks and deltas to these categories so perf work targets the right layer.
 */
export const ChatPerfCategory = {
	/** Workspace discovery / chat context orchestrator before agent invoke */
	ContextBuild: 'context-build',
	/** Typing / submit → request visible in the list */
	UiResponse: 'ui-response',
	/** AI content → painted in the chat list */
	MessageRender: 'message-render',
	/** Token/chunk arrival → incremental render passes */
	Streaming: 'streaming',
	/** Heap growth across a long session */
	Memory: 'memory',
	/** Long main-thread frames after render (rAF gap) */
	Jank: 'jank',
	/** Agent invoke / API round-trip */
	Network: 'network',
} as const;

export type ChatPerfCategory = typeof ChatPerfCategory[keyof typeof ChatPerfCategory];

export interface IChatPerfMarkMeta {
	readonly chars?: number;
	readonly chunkIndex?: number;
	readonly requestId?: string;
	readonly messageId?: string;
	readonly detail?: string;
	/** True when NFR-CC-01 returned partial workspace context. */
	readonly partial?: boolean;
}

export interface IChatPerfInstrumentationSink {
	isEnabled(): boolean;
	isVerbose(): boolean;
	logToConsole(): boolean;
	appendLine(line: string): void;
}

let sink: IChatPerfInstrumentationSink | undefined;

export function setChatPerfInstrumentationSink(next: IChatPerfInstrumentationSink | undefined): void {
	sink = next;
}

interface ISessionPerfState {
	readonly marks: Map<string, number>;
	chunkCount: number;
	streamChars: number;
	memoryAtStartMb?: number;
	readonly activeConsoleTimers: Set<string>;
	requestId?: string;
}

const sessions = new Map<string, ISessionPerfState>();

const MARK_CATEGORY: Record<string, ChatPerfCategory> = {
	[ChatPerfMark.RequestStart]: ChatPerfCategory.UiResponse,
	[ChatPerfMark.ContextBuildWillStart]: ChatPerfCategory.ContextBuild,
	[ChatPerfMark.ContextBuildDidComplete]: ChatPerfCategory.ContextBuild,
	[ChatPerfMark.RequestUiUpdated]: ChatPerfCategory.UiResponse,
	[ChatPerfMark.WillCollectInstructions]: ChatPerfCategory.UiResponse,
	[ChatPerfMark.DidCollectInstructions]: ChatPerfCategory.UiResponse,
	[ChatPerfMark.ApiRequestSent]: ChatPerfCategory.Network,
	[ChatPerfMark.AgentWillInvoke]: ChatPerfCategory.Network,
	[ChatPerfMark.AgentDidInvoke]: ChatPerfCategory.Network,
	[ChatPerfMark.FirstToken]: ChatPerfCategory.Streaming,
	[ChatPerfMark.StreamChunkReceived]: ChatPerfCategory.Streaming,
	[ChatPerfMark.ChunkRendered]: ChatPerfCategory.MessageRender,
	[ChatPerfMark.MessageRenderComplete]: ChatPerfCategory.MessageRender,
	[ChatPerfMark.UiReflowComplete]: ChatPerfCategory.Jank,
	[ChatPerfMark.RequestComplete]: ChatPerfCategory.UiResponse,
};

/** Pairs emitted as performance.measure when the browser supports it. */
const MEASURE_PAIRS: Array<{ start: string; end: string; label: string; category: ChatPerfCategory }> = [
	{ start: ChatPerfMark.ContextBuildWillStart, end: ChatPerfMark.ContextBuildDidComplete, label: 'context-build', category: ChatPerfCategory.ContextBuild },
	{ start: ChatPerfMark.RequestStart, end: ChatPerfMark.ContextBuildDidComplete, label: 'submit-to-context-ready', category: ChatPerfCategory.ContextBuild },
	{ start: ChatPerfMark.RequestStart, end: ChatPerfMark.RequestUiUpdated, label: 'time-to-ui-feedback', category: ChatPerfCategory.UiResponse },
	{ start: ChatPerfMark.RequestStart, end: ChatPerfMark.FirstToken, label: 'time-to-first-token', category: ChatPerfCategory.Streaming },
	{ start: ChatPerfMark.AgentWillInvoke, end: ChatPerfMark.AgentDidInvoke, label: 'agent-round-trip', category: ChatPerfCategory.Network },
	{ start: ChatPerfMark.FirstToken, end: ChatPerfMark.MessageRenderComplete, label: 'first-token-to-render-complete', category: ChatPerfCategory.MessageRender },
	{ start: ChatPerfMark.RequestStart, end: ChatPerfMark.RequestComplete, label: 'total-request', category: ChatPerfCategory.UiResponse },
];

function sessionKey(sessionResource: URI): string {
	return chatSessionResourceToId(sessionResource);
}

function getOrCreateSession(sessionResource: URI): ISessionPerfState {
	const key = sessionKey(sessionResource);
	let state = sessions.get(key);
	if (!state) {
		state = { marks: new Map(), chunkCount: 0, streamChars: 0, activeConsoleTimers: new Set() };
		sessions.set(key, state);
	}
	return state;
}

function readMemoryUsedMb(): number | undefined {
	const perf = globalThis.performance as Performance & { memory?: { usedJSHeapSize: number } };
	const used = perf.memory?.usedJSHeapSize;
	return typeof used === 'number' ? Math.round(used / (1024 * 1024)) : undefined;
}

function tryPerformanceMeasure(sessionId: string, startMark: string, endMark: string, measureName: string): void {
	const perf = globalThis.performance;
	if (typeof perf?.measure !== 'function') {
		return;
	}
	const start = `code/chat/${sessionId}/${startMark}`;
	const end = `code/chat/${sessionId}/${endMark}`;
	try {
		perf.measure(measureName, start, end);
	} catch {
		// Marks may be missing if instrumentation started mid-request.
	}
}

function deltaMs(state: ISessionPerfState, fromMark: string, toMark: string): number | undefined {
	const from = state.marks.get(fromMark);
	const to = state.marks.get(toMark);
	if (from === undefined || to === undefined) {
		return undefined;
	}
	return Math.max(0, to - from);
}

function formatDelta(delta: number | undefined): string {
	return delta === undefined ? '—' : `${delta}ms`;
}

function emitSummary(sessionResource: URI, state: ISessionPerfState): void {
	if (!sink?.isEnabled()) {
		return;
	}
	const lines: string[] = [
		'',
		`── Chat perf summary [${sessionKey(sessionResource)}] ──`,
		`  📂 Context build:               ${formatDelta(deltaMs(state, ChatPerfMark.ContextBuildWillStart, ChatPerfMark.ContextBuildDidComplete))}`,
		`  ⏱ Submit→context ready:        ${formatDelta(deltaMs(state, ChatPerfMark.RequestStart, ChatPerfMark.ContextBuildDidComplete))}`,
		`  ⏱ UI response (submit→UI):     ${formatDelta(deltaMs(state, ChatPerfMark.RequestStart, ChatPerfMark.RequestUiUpdated))}`,
		`  🌐 Network (agent invoke):      ${formatDelta(deltaMs(state, ChatPerfMark.AgentWillInvoke, ChatPerfMark.AgentDidInvoke))}`,
		`  ⏱ Time to first token:         ${formatDelta(deltaMs(state, ChatPerfMark.RequestStart, ChatPerfMark.FirstToken))}`,
		`  ⏱ Streaming (1st token→done):  ${formatDelta(deltaMs(state, ChatPerfMark.FirstToken, ChatPerfMark.MessageRenderComplete))}`,
		`  ⏱ Message render complete:     ${formatDelta(deltaMs(state, ChatPerfMark.FirstToken, ChatPerfMark.MessageRenderComplete))}`,
		`  ⏱ Total request:               ${formatDelta(deltaMs(state, ChatPerfMark.RequestStart, ChatPerfMark.RequestComplete))}`,
		`  📦 Stream chunks rendered:     ${state.chunkCount}`,
		`  📝 Stream chars (progress):    ${state.streamChars}`,
	];
	const memEnd = readMemoryUsedMb();
	if (state.memoryAtStartMb !== undefined && memEnd !== undefined) {
		const growth = memEnd - state.memoryAtStartMb;
		lines.push(`  🧠 Memory: ${state.memoryAtStartMb}MB → ${memEnd}MB (Δ ${growth >= 0 ? '+' : ''}${growth}MB)`);
	}
	lines.push('  Tip: DevTools → Performance → record while sending a chat message.');
	lines.push('────────────────────────────────────────');
	for (const line of lines) {
		sink.appendLine(line);
	}
}

function endConsoleTimers(state: ISessionPerfState, sessionId: string): void {
	if (!sink?.logToConsole()) {
		state.activeConsoleTimers.clear();
		return;
	}
	for (const name of state.activeConsoleTimers) {
		try {
			console.timeEnd(name);
		} catch {
			// ignore
		}
	}
	state.activeConsoleTimers.clear();
}

/**
 * Records a perf mark with optional metadata. Called from {@link markChat} and
 * direct instrumentation sites (renderer chunk passes, progress callbacks).
 */
export function notifyChatPerfMark(sessionResource: URI, markName: string, meta?: IChatPerfMarkMeta): void {
	if (!sink?.isEnabled()) {
		return;
	}

	const now = Date.now();
	const state = getOrCreateSession(sessionResource);
	const sessionId = sessionKey(sessionResource);
	const prev = state.marks.get(markName);
	state.marks.set(markName, now);

	if (markName === ChatPerfMark.RequestStart) {
		state.chunkCount = 0;
		state.streamChars = 0;
		state.memoryAtStartMb = readMemoryUsedMb();
		state.requestId = meta?.requestId;
		if (sink.logToConsole()) {
			const timerName = `chat:${sessionId}:response`;
			state.activeConsoleTimers.add(timerName);
			console.time(timerName);
		}
		if (sink.isVerbose() && sink.logToConsole()) {
			console.time(`chat:${sessionId}:api-call`);
		}
	}

	if (markName === ChatPerfMark.ApiRequestSent && sink.isVerbose() && sink.logToConsole()) {
		try {
			console.timeEnd(`chat:${sessionId}:api-call`);
		} catch {
			// ignore
		}
	}

	if (markName === ChatPerfMark.StreamChunkReceived) {
		state.chunkCount++;
		if (typeof meta?.chars === 'number') {
			state.streamChars += meta.chars;
		}
	}

	if (markName === ChatPerfMark.ChunkRendered) {
		state.chunkCount++;
	}

	if (markName === ChatPerfMark.RequestComplete) {
		for (const pair of MEASURE_PAIRS) {
			if (state.marks.has(pair.start) && state.marks.has(pair.end)) {
				tryPerformanceMeasure(sessionId, pair.start, pair.end, `chat/${pair.label}`);
			}
		}
		emitSummary(sessionResource, state);
		endConsoleTimers(state, sessionId);
		sessions.delete(sessionId);
		return;
	}

	const category = MARK_CATEGORY[markName] ?? 'other';
	const sinceStart = deltaMs(state, ChatPerfMark.RequestStart, markName);
	const sincePrev = prev !== undefined ? now - prev : undefined;
	const parts = [
		`[${category}]`,
		markName,
		sinceStart !== undefined ? `+${sinceStart}ms` : '',
		sincePrev !== undefined ? `(Δ ${sincePrev}ms)` : '',
	];
	if (meta?.chars !== undefined) {
		parts.push(`${meta.chars} chars`);
	}
	if (meta?.chunkIndex !== undefined) {
		parts.push(`chunk #${meta.chunkIndex}`);
	}
	if (meta?.detail) {
		parts.push(meta.detail);
	}
	if (meta?.partial) {
		parts.push('partial');
	}
	const line = parts.filter(Boolean).join(' ');

	const isHighFrequency = markName === ChatPerfMark.StreamChunkReceived || markName === ChatPerfMark.ChunkRendered;
	if (isHighFrequency && !sink.isVerbose()) {
		// Count only; summary logs totals on RequestComplete.
		return;
	}

	sink.appendLine(line);
	if (sink.logToConsole()) {
		console.log(`[QuantumIDE Chat Perf] ${line}`);
	}
}

export function clearChatPerfInstrumentationSession(sessionResource: URI): void {
	sessions.delete(sessionKey(sessionResource));
}

/** Schedules a jank probe: logs if rAF gap exceeds threshold after render work. */
export function scheduleChatPerfReflowProbe(sessionResource: URI, thresholdMs = 32): void {
	if (!sink?.isEnabled()) {
		return;
	}
	const t0 = Date.now();
	requestAnimationFrame(() => {
		requestAnimationFrame(() => {
			const gap = Date.now() - t0;
			if (gap >= thresholdMs) {
				notifyChatPerfMark(sessionResource, ChatPerfMark.UiReflowComplete, { detail: `rAF gap ${gap}ms (possible jank)` });
			}
		});
	});
}

/** DevTools helper: dump all code/chat/* marks currently recorded. */
export function dumpChatPerfMarksToConsole(): void {
	const marks = getMarks().filter(m => m.name.startsWith('code/chat/'));
	console.table(marks.map(m => ({ name: m.name, startTime: m.startTime })));
}
