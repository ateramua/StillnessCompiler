/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mark, clearMarks } from '../../../../base/common/performance.js';
import { URI } from '../../../../base/common/uri.js';
import { chatSessionResourceToId } from './model/chatUri.js';
import { clearChatPerfInstrumentationSession, notifyChatPerfMark, type IChatPerfMarkMeta } from './chatPerfInstrumentation.js';
import { ChatGlobalPerfMark, ChatPerfMark } from './chatPerfMarks.js';

export { ChatGlobalPerfMark, ChatPerfMark };

const chatPerfPrefix = 'code/chat/';

/** Tracks all mark names emitted per session so they can be cleared individually. */
const chatMarksBySession = new Map<string, Set<string>>();

/**
 * Well-defined perf scenarios for chat request lifecycle.
 * Each mark is a boundary of a measurable scenario — don't add marks
 * without defining what scenario they belong to.
 *
 * ## Scenarios
 *
 * **Context build** (QuantumIDE workspace discovery on send):
 *   `context/buildWillStart` → `context/buildDidComplete`
 *
 * **Time to UI Feedback** (perceived input lag):
 *   `request/start` → `request/uiUpdated`
 *
 * **Instruction Collection Overhead**:
 *   `request/willCollectInstructions` → `request/didCollectInstructions`
 *
 * **Extension Activation Wait** (first-request cold start):
 *   `code/chat/willWaitForActivation` → `code/chat/didWaitForActivation`
 *   (global marks, not session-scoped — emitted via {@link markChatGlobal})
 *
 * **Time to First Token** (the headline metric):
 *   `request/start` → `request/firstToken`
 *
 * **Total Request Duration**:
 *   `request/start` → `request/complete`
 *
 * **Agent Invocation Time** (LLM round-trip):
 *   `agent/willInvoke` → `agent/didInvoke`
 *
 * **QuantumIDE instrumentation** (see chatPerfInstrumentation.ts):
 *   - `request/apiSent` — provider HTTP/stream opened
 *   - `stream/chunkReceived` — progress callback chunk
 *   - `render/chunk` — list renderer incremental pass
 *   - `render/messageComplete` — response row fully painted
 *   - `render/uiReflow` — post-render layout / jank probe
 */
/**
 * Emits a performance mark scoped to a chat session:
 * `code/chat/<sessionResource>/<name>`
 *
 * Marks are automatically cleaned up when the corresponding chat model is
 * disposed — see {@link clearChatMarks}.
 */
export function markChat(sessionResource: URI, name: string, meta?: IChatPerfMarkMeta): void {
	const sessionId = chatSessionResourceToId(sessionResource);
	const fullName = `${chatPerfPrefix}${sessionId}/${name}`;
	let names = chatMarksBySession.get(sessionId);
	if (!names) {
		names = new Set();
		chatMarksBySession.set(sessionId, names);
	}
	names.add(fullName);
	mark(fullName);
	notifyChatPerfMark(sessionResource, name, meta);
}

/**
 * Clears all performance marks for the given chat session.
 * Called when the chat model is disposed.
 */
export function clearChatMarks(sessionResource: URI): void {
	const sessionId = chatSessionResourceToId(sessionResource);
	const names = chatMarksBySession.get(sessionId);
	if (names) {
		for (const name of names) {
			clearMarks(name);
		}
		chatMarksBySession.delete(sessionId);
	}
	clearChatPerfInstrumentationSession(sessionResource);
}

/**
 * Well-defined one-time global perf marks (not scoped to a session).
 * These are emitted via {@link markChatGlobal} and are never cleared.
 */
/**
 * Emits a global (non-session-scoped) performance mark:
 * `code/chat/<name>`
 *
 * Used for one-time marks like activation that should persist across requests.
 */
export function markChatGlobal(name: string): void {
	mark(`${chatPerfPrefix}${name}`);
}
