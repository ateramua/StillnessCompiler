/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import {
	formatActivityCapSummaryMessage,
	formatOrchestratorStepActivity,
	getExecutionGraphPhaseActivityLabel,
	shouldCoalesceActivityLabels,
	sanitizeActivityDetailText,
} from '../../common/agentActivityProgress.js';
import { shouldReplaceSessionActivityMessage } from '../../common/agentActivitySession.js';

suite('QuantumIDE agent activity progress', () => {
	test('cap summary message', () => {
		assert.ok(formatActivityCapSummaryMessage(12).includes('12'));
	});

	test('coalesce within window', () => {
		const now = 10_000;
		assert.strictEqual(shouldCoalesceActivityLabels('Grepping', now - 100, 'Grepping', now, 300), true);
		assert.strictEqual(shouldCoalesceActivityLabels('Grepping', now - 400, 'Grepping', now, 300), false);
	});

	test('execution graph phase labels', () => {
		assert.ok(getExecutionGraphPhaseActivityLabel('retrieval', 'index').includes('index'));
	});

	test('orchestrator step label', () => {
		assert.ok(formatOrchestratorStepActivity(2, 5, 'Search').includes('2'));
	});

	test('sanitize secrets', () => {
		assert.strictEqual(sanitizeActivityDetailText('sk-abcdefghijklmnopqrstuvwxyz'), undefined);
		assert.strictEqual(sanitizeActivityDetailText('safe-path'), 'safe-path');
	});

	test('session activity dedup', () => {
		assert.strictEqual(shouldReplaceSessionActivityMessage('Thinking…', 'Thinking…'), false);
		assert.strictEqual(shouldReplaceSessionActivityMessage('Thinking…', 'Working…'), true);
	});
});
