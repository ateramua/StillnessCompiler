/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import {
	appendPartialContextFooter,
	discoveryBudgetDeadlineMs,
	isDiscoveryBudgetExceeded,
	QuantumIDEPerformanceBudgetMs,
	QUANTUMIDE_PARTIAL_CONTEXT_FOOTER,
	runDiscoveryWithinBudget,
} from '../../common/quantumidePerformanceBudgets.js';
import {
	formatQuantumIDEWorkspaceDiscoveryLog,
	formatQuantumIDEWorkspaceDiscoverySessionFlags,
} from '../../common/quantumideWorkspaceDiscoveryLog.js';
import {
	getQuantumIDEPerformanceMarks,
	markQuantumIDEPerformanceEnd,
	markQuantumIDEPerformanceStart,
	QuantumIDEPerformanceMark,
} from '../../common/quantumidePerformanceMarks.js';

suite('QuantumIDE workspace discovery compliance (NFR-CC-01 / NFR-CC-05)', () => {
	test('NFR-CC-01: discovery budgets match chat send targets', () => {
		assert.strictEqual(QuantumIDEPerformanceBudgetMs.chatStartup, 1500);
		assert.strictEqual(QuantumIDEPerformanceBudgetMs.chatContextBuild, 500);
	});

	test('NFR-CC-01: partial context footer is appended when degraded', () => {
		const body = appendPartialContextFooter('## Workspace\n\nsnapshot', true);
		assert.ok(body.includes(QUANTUMIDE_PARTIAL_CONTEXT_FOOTER.trim().slice(0, 24)));
		assert.strictEqual(appendPartialContextFooter('same', false), 'same');
	});

	test('NFR-CC-01: runDiscoveryWithinBudget returns undefined when deadline elapsed', async () => {
		const deadline = discoveryBudgetDeadlineMs(-1);
		assert.ok(isDiscoveryBudgetExceeded(deadline));
		const result = await runDiscoveryWithinBudget('late-step', deadline, async () => 'ok');
		assert.strictEqual(result, undefined);
	});

	test('NFR-CC-01: runDiscoveryWithinBudget returns value when within budget', async () => {
		const deadline = discoveryBudgetDeadlineMs(5000);
		const result = await runDiscoveryWithinBudget('fast-step', deadline, async () => 42);
		assert.strictEqual(result, 42);
	});

	test('NFR-CC-05: structured discovery logs use grep-friendly prefix', () => {
		const success = formatQuantumIDEWorkspaceDiscoveryLog({
			component: 'chat-context',
			operation: 'buildChatContext',
			durationMs: 12,
			fileCount: 8,
		});
		assert.ok(success.startsWith('[QuantumIDE][workspace-discovery]'));
		assert.ok(success.includes('component=chat-context'));
		assert.ok(success.includes('op=buildChatContext'));
		assert.ok(success.includes('durationMs=12'));
		assert.ok(success.includes('files=8'));

		const failure = formatQuantumIDEWorkspaceDiscoveryLog({
			component: 'agent-search',
			operation: 'search_workspace_text',
			error: 'timeout',
		});
		assert.ok(failure.includes('error=timeout'));
	});

	test('NFR-CC-05: session feature flags log is structured', () => {
		const line = formatQuantumIDEWorkspaceDiscoverySessionFlags({
			indexingEnabled: true,
			semanticIndexingEnabled: false,
			tokenBudget: 12000,
			ignoreFile: '.qideignore',
			syncRealtime: true,
		});
		assert.ok(line.includes('op=session-feature-flags'));
		assert.ok(line.includes('indexing=true'));
	});

	test('NFR-CC-05: budgeted operations record performance marks', () => {
		markQuantumIDEPerformanceStart(QuantumIDEPerformanceMark.ChatStartup);
		markQuantumIDEPerformanceStart(QuantumIDEPerformanceMark.ChatContextBuild);
		const buildMs = markQuantumIDEPerformanceEnd(QuantumIDEPerformanceMark.ChatContextBuild);
		const startupMs = markQuantumIDEPerformanceEnd(QuantumIDEPerformanceMark.ChatStartup);
		assert.ok(buildMs !== undefined && buildMs >= 0);
		assert.ok(startupMs !== undefined && startupMs >= 0);
		const marks = getQuantumIDEPerformanceMarks();
		assert.ok(marks.some(m => m.name === QuantumIDEPerformanceMark.ChatContextBuild));
		assert.ok(marks.some(m => m.name === QuantumIDEPerformanceMark.ChatStartup));
	});
});
