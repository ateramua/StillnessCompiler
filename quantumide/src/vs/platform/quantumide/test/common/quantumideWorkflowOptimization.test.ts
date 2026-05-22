/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import {
	normalizeEditVelocity,
	normalizeVerifyOnEdit,
	resolveApplyWorkspaceEditsOptions,
	resolveEffectiveEditVelocity,
	resolveWorkflowOptimizationConfig,
	shouldPreferDirectEditorEdit,
	formatBatchApplySummary,
	getWorkflowOptimizationSystemAddon,
	isDocumentationPath,
	shouldSkipCompileVerificationForPaths,
} from '../../common/quantumideWorkflowOptimization.js';
import type { IQuantumIDEWorkspaceEdit } from '../../common/quantumideWorkspaceEdits.js';

suite('quantumideWorkflowOptimization', () => {
	test('normalizeVerifyOnEdit defaults to always', () => {
		assert.strictEqual(normalizeVerifyOnEdit(undefined), 'always');
		assert.strictEqual(normalizeVerifyOnEdit('defer'), 'defer');
		assert.strictEqual(normalizeVerifyOnEdit('never'), 'never');
		assert.strictEqual(normalizeVerifyOnEdit('invalid'), 'always');
	});

	test('resolveWorkflowOptimizationConfig matches requirements defaults', () => {
		const config = resolveWorkflowOptimizationConfig({});
		assert.strictEqual(config.autoApplyEdits, false);
		assert.strictEqual(config.instantPaletteCommands, false);
		assert.strictEqual(config.verifyOnEdit, 'always');
		assert.strictEqual(config.preferDirectEditorEdits, true);
		assert.strictEqual(config.directEditorMaxLines, 100);
		assert.strictEqual(config.fastApplyEdits, false);
	});

	test('shouldPreferDirectEditorEdit for small single-file write', () => {
		const edits: IQuantumIDEWorkspaceEdit[] = [{ operation: 'write', path: 'a.ts', content: 'line1\nline2\n' }];
		assert.strictEqual(shouldPreferDirectEditorEdit(edits, 100, true), true);
		assert.strictEqual(shouldPreferDirectEditorEdit(edits, 1, true), false);
		assert.strictEqual(shouldPreferDirectEditorEdit([...edits, { operation: 'write', path: 'b.ts', content: 'x' }], 100, true), false);
	});

	test('resolveApplyWorkspaceEditsOptions by velocity', () => {
		const maximum = resolveApplyWorkspaceEditsOptions({ editVelocity: 'maximum', editCount: 1 });
		assert.strictEqual(maximum.skipReadBeforeWrite, true);
		assert.strictEqual(maximum.skipPreserveFormatting, true);
		assert.strictEqual(maximum.atomic, false);
		const maximumBatch = resolveApplyWorkspaceEditsOptions({ editVelocity: 'maximum', editCount: 3 });
		assert.strictEqual(maximumBatch.atomic, true);
		const fast = resolveApplyWorkspaceEditsOptions({ editVelocity: 'fast' });
		assert.strictEqual(fast.validateSyntax, false);
		assert.strictEqual(fast.createCheckpoints, false);
		const safe = resolveApplyWorkspaceEditsOptions({ editVelocity: 'safe' });
		assert.strictEqual(safe.validateSyntax, true);
		assert.strictEqual(safe.createCheckpoints, true);
	});

	test('resolveEffectiveEditVelocity boosts documentation paths', () => {
		assert.strictEqual(
			resolveEffectiveEditVelocity({ editVelocity: 'fast' }, ['docs/quantumide-user-guide.html']),
			'maximum',
		);
		assert.strictEqual(normalizeEditVelocity('maximum'), 'maximum');
	});

	test('documentation paths skip compile and direct-editor redirect', () => {
		assert.strictEqual(isDocumentationPath('docs/quantumide-user-guide.html'), true);
		assert.strictEqual(shouldSkipCompileVerificationForPaths(['docs/quantumide-user-guide.html']), true);
		const edits: IQuantumIDEWorkspaceEdit[] = [{ operation: 'write', path: 'docs/guide.html', content: 'a\nb\n' }];
		assert.strictEqual(shouldPreferDirectEditorEdit(edits, 100, true), false);
	});

	test('formatBatchApplySummary and system addon', () => {
		const summary = formatBatchApplySummary('refactor auth', 2, ['updated a.ts', 'updated b.ts']);
		assert.ok(summary.includes('refactor auth'));
		assert.ok(summary.includes('updated a.ts'));
		const addon = getWorkflowOptimizationSystemAddon(resolveWorkflowOptimizationConfig({ autoApplyEdits: true }));
		assert.ok(addon.includes('Auto-apply is ON'));
	});
});
