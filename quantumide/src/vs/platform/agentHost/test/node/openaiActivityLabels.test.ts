/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import {
	formatSearchCompletedLabel,
	getAgentActivityDisplayName,
	getAgentActivityIconId,
	getAgentActivityLabel,
	getAgentActivityMessage,
	getAgentStatusActivityLabel,
	resolveAgentActivityDisplayName,
	resolveAgentActivityProgressMessage,
} from '../../../quantumide/common/agentActivityLabels.js';

suite('openaiActivityLabels', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('maps host search and read tools to Cursor-style running and completed labels', () => {
		const search = getAgentActivityLabel('search_workspace_text', { query: 'OpenAI stream' }, 'normal');
		assert.strictEqual(search.kind, 'search');
		assert.strictEqual(search.runningLabel, 'Grepping for `OpenAI stream`');
		assert.strictEqual(search.completedLabel, 'Grepped for `OpenAI stream`');
		assert.strictEqual(search.detail, 'OpenAI stream');

		const read = getAgentActivityLabel('read_workspace_file', { path: 'src/app.ts' }, 'normal');
		assert.strictEqual(read.kind, 'read');
		assert.strictEqual(read.runningLabel, 'Reading `app.ts`');
		assert.strictEqual(read.completedLabel, 'Read `app.ts`');
	});

	test('uses minimal labels when requested', () => {
		const terminal = getAgentActivityLabel('propose_terminal_command', { command: 'npm test' }, 'minimal');
		assert.strictEqual(terminal.kind, 'terminal');
		assert.strictEqual(terminal.runningLabel, 'Running command');
		assert.strictEqual(terminal.completedLabel, 'Ran command');
	});

	test('session status labels are distinct', () => {
		assert.strictEqual(getAgentStatusActivityLabel('thinking'), 'Thinking…');
		assert.strictEqual(getAgentStatusActivityLabel('reasoning'), 'Reasoning…');
		assert.strictEqual(getAgentStatusActivityLabel('working'), 'Working…');
	});

	test('quantumide chat tools map to activity kinds', () => {
		assert.strictEqual(getAgentActivityLabel('quantumide_lsp_workspace_rename').kind, 'tool');
		assert.strictEqual(getAgentActivityLabel('quantumide_run_terminal_command').kind, 'terminal');
		assert.strictEqual(getAgentActivityLabel('quantumide_manipulate_editor').kind, 'edit');
	});

	test('resolveAgentActivityProgressMessage distinguishes running vs completed', () => {
		const running = resolveAgentActivityProgressMessage('grep', undefined, '{"query":"foo"}', false, undefined);
		const completed = resolveAgentActivityProgressMessage('grep', undefined, '{"query":"foo"}', true, true);
		assert.strictEqual(running, 'Grepping for `foo`');
		assert.strictEqual(completed, 'Grepped for `foo`');
	});

	test('display name helper returns completed label for unknown tools', () => {
		assert.strictEqual(getAgentActivityDisplayName('custom_tool'), 'Ran custom tool');
		assert.strictEqual(getAgentActivityMessage('custom_tool', {}, 'normal', 'running'), 'Running custom tool');
	});

	test('read labels include optional line range', () => {
		const read = getAgentActivityLabel('read_workspace_file', { path: 'src/app.ts', startLine: 10, endLine: 20 }, 'normal');
		assert.ok(read.runningLabel.includes('lines 10-20'));
	});

	test('list_workspace_symbols uses dedicated labels', () => {
		const listed = getAgentActivityLabel('list_workspace_symbols', { path: 'src/app.ts' }, 'normal');
		assert.strictEqual(listed.runningLabel, 'Listing symbols in `app.ts`');
		assert.strictEqual(listed.completedLabel, 'Listed symbols in `app.ts`');
	});

	test('formatSearchCompletedLabel appends match count', () => {
		const label = formatSearchCompletedLabel('Grepped for `foo`', 'Found 3 match(es) for "foo":');
		assert.strictEqual(label, 'Grepped for `foo` (3 matches)');
	});

	test('getAgentActivityIconId maps kinds to codicons', () => {
		assert.strictEqual(getAgentActivityIconId('search'), 'search');
		assert.strictEqual(getAgentActivityIconId('read'), 'go-to-file');
		assert.strictEqual(getAgentActivityIconId('terminal'), 'terminal');
		assert.strictEqual(getAgentActivityIconId('plan'), 'sparkle');
	});

	test('resolveAgentActivityDisplayName prefers custom server labels', () => {
		assert.strictEqual(resolveAgentActivityDisplayName('grep', 'grep', '{"query":"foo"}'), 'Grepped for `foo`');
		assert.strictEqual(resolveAgentActivityDisplayName('grep', 'Custom label', '{"query":"foo"}'), 'Custom label');
		assert.strictEqual(resolveAgentActivityDisplayName('read_file', undefined, '{"path":"src/main.ts"}'), 'Read `main.ts`');
	});
});
