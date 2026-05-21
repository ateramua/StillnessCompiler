/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { OS } from '../../../../base/common/platform.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { ContextKeyExpr } from '../../../contextkey/common/contextkey.js';
import { KeybindingResolver } from '../../../keybinding/common/keybindingResolver.js';
import { ResolvedKeybindingItem } from '../../../keybinding/common/resolvedKeybindingItem.js';
import { createUSLayoutResolvedKeybinding } from '../../../keybinding/test/common/keybindingsTestUtils.js';
import {
	detectQuantumIDEKeybindingConflicts,
	quantumIDEKeybindingItemsConflict,
} from '../../common/quantumideKeybindingConflicts.js';

function kbItem(encodedKeybinding: number, command: string, when: ReturnType<typeof ContextKeyExpr.has> | undefined, isDefault = true): ResolvedKeybindingItem {
	const resolvedKeybinding = createUSLayoutResolvedKeybinding(encodedKeybinding, OS)!;
	return new ResolvedKeybindingItem(resolvedKeybinding, command, undefined, when, isDefault, null, false);
}

suite('QuantumIDE keybinding conflicts', () => {
	test('does not flag context-scoped global chords', () => {
		const escapeA = kbItem(KeyCode.Escape, 'closeReferenceSearch', ContextKeyExpr.has('inReferenceSearch'));
		const escapeB = kbItem(KeyCode.Escape, 'hideSuggestWidget', ContextKeyExpr.has('suggestWidgetVisible'));
		assert.strictEqual(quantumIDEKeybindingItemsConflict(escapeA, escapeB), false);
	});

	test('flags overlapping QuantumIDE bindings', () => {
		const chord = KeyMod.CtrlCmd | KeyCode.KeyK;
		const a = kbItem(chord, 'quantumide.ai.newAgentChat', undefined);
		const b = kbItem(chord, 'quantumide.ai.explainSelection', undefined);
		const conflicts = detectQuantumIDEKeybindingConflicts([a, b]);
		assert.strictEqual(conflicts.length, 1);
		assert.strictEqual(conflicts[0].commands.length, 2);
	});

	test('ignores shadowed bindings', () => {
		const chord = KeyMod.CtrlCmd | KeyCode.KeyK;
		const general = kbItem(chord, 'quantumide.ai.newAgentChat', undefined);
		const specific = kbItem(chord, 'quantumide.ai.explainSelection', ContextKeyExpr.has('editorFocus'));
		assert.strictEqual(
			KeybindingResolver.whenIsEntirelyIncluded(general.when, specific.when),
			true,
		);
		assert.strictEqual(quantumIDEKeybindingItemsConflict(general, specific), false);
	});
});
