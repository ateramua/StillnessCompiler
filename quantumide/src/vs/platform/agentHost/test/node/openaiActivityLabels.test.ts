/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getAgentActivityDisplayName, getAgentActivityLabel, resolveAgentActivityDisplayName } from '../../../quantumide/common/agentActivityLabels.js';

suite('openaiActivityLabels', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('maps host search and read tools to activity kinds', () => {
		const search = getAgentActivityLabel('search_workspace_text', { query: 'OpenAI stream' }, 'normal');
		assert.strictEqual(search.kind, 'search');
		assert.ok(search.label.toLowerCase().includes('search'));
		assert.strictEqual(search.detail, 'OpenAI stream');

		const read = getAgentActivityLabel('read_workspace_file', { path: 'src/app.ts' }, 'normal');
		assert.strictEqual(read.kind, 'read');
		assert.strictEqual(read.label, 'Read app.ts');
		assert.strictEqual(read.detail, 'src/app.ts');
	});

	test('uses minimal labels when requested', () => {
		const terminal = getAgentActivityLabel('propose_terminal_command', { command: 'npm test' }, 'minimal');
		assert.strictEqual(terminal.kind, 'terminal');
		assert.strictEqual(terminal.label, 'Ran terminal command');
	});

	test('display name helper returns a label for unknown tools', () => {
		assert.strictEqual(getAgentActivityDisplayName('custom_tool'), 'custom tool');
	});

	test('resolveAgentActivityDisplayName prefers server labels but maps generic tool names', () => {
		assert.strictEqual(resolveAgentActivityDisplayName('grep', 'grep', '{"query":"foo"}'), 'Searched workspace');
		assert.strictEqual(resolveAgentActivityDisplayName('grep', 'Custom label', '{"query":"foo"}'), 'Custom label');
		assert.strictEqual(resolveAgentActivityDisplayName('read_file', undefined, '{"path":"src/main.ts"}'), 'Read main.ts');
	});
});
