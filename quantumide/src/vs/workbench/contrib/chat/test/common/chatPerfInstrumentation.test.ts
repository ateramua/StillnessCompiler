/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ChatPerfMark } from '../../common/chatPerf.js';
import {
	ChatPerfCategory,
	notifyChatPerfMark,
	setChatPerfInstrumentationSink,
	type IChatPerfInstrumentationSink,
} from '../../common/chatPerfInstrumentation.js';

suite('chatPerfInstrumentation', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	let lines: string[];
	let sink: IChatPerfInstrumentationSink;
	let session: URI;

	setup(() => {
		lines = [];
		session = URI.parse(`test://chat-perf/${Date.now()}`);
		sink = {
			isEnabled: () => true,
			isVerbose: () => false,
			logToConsole: () => false,
			appendLine: (line: string) => lines.push(line),
		};
		setChatPerfInstrumentationSink(sink);
	});

	teardown(() => {
		setChatPerfInstrumentationSink(undefined);
	});

	test('logs categorized marks with deltas', () => {
		notifyChatPerfMark(session, ChatPerfMark.RequestStart);
		notifyChatPerfMark(session, ChatPerfMark.RequestUiUpdated);

		assert.ok(lines.some(l => l.includes(ChatPerfCategory.UiResponse)));
		assert.ok(lines.some(l => l.includes(ChatPerfMark.RequestUiUpdated)));
	});

	test('logs context build marks (OBS-01)', () => {
		notifyChatPerfMark(session, ChatPerfMark.RequestStart);
		notifyChatPerfMark(session, ChatPerfMark.ContextBuildWillStart);
		notifyChatPerfMark(session, ChatPerfMark.ContextBuildDidComplete, { chars: 1200, partial: false });
		notifyChatPerfMark(session, ChatPerfMark.RequestComplete);

		assert.ok(lines.some(l => l.includes(ChatPerfCategory.ContextBuild)));
		assert.ok(lines.some(l => l.includes(ChatPerfMark.ContextBuildDidComplete)));
		assert.ok(lines.some(l => l.includes('Context build')));
		assert.ok(lines.some(l => l.includes('1200 chars')));
	});

	test('emits summary on request complete', () => {
		notifyChatPerfMark(session, ChatPerfMark.RequestStart);
		notifyChatPerfMark(session, ChatPerfMark.RequestUiUpdated);
		notifyChatPerfMark(session, ChatPerfMark.FirstToken);
		notifyChatPerfMark(session, ChatPerfMark.RequestComplete);

		assert.ok(lines.some(l => l.includes('Chat perf summary')));
		assert.ok(lines.some(l => l.includes('Time to first token')));
	});

	test('skips high-frequency chunk logs unless verbose', () => {
		notifyChatPerfMark(session, ChatPerfMark.RequestStart);
		notifyChatPerfMark(session, ChatPerfMark.StreamChunkReceived, { chars: 10, chunkIndex: 0 });
		assert.strictEqual(lines.filter(l => l.includes('stream/chunkReceived')).length, 0);
	});

	test('logs chunks when verbose', () => {
		setChatPerfInstrumentationSink({
			...sink,
			isVerbose: () => true,
		});
		notifyChatPerfMark(session, ChatPerfMark.RequestStart);
		notifyChatPerfMark(session, ChatPerfMark.StreamChunkReceived, { chars: 10, chunkIndex: 0 });
		assert.ok(lines.some(l => l.includes('stream/chunkReceived')));
	});
});
