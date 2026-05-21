/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { KeybindingResolver } from '../../keybinding/common/keybindingResolver.js';
import type { ResolvedKeybindingItem } from '../../keybinding/common/resolvedKeybindingItem.js';

export interface IQuantumIDEKeybindingConflict {
	readonly chord: string;
	readonly commands: readonly string[];
	readonly reason: 'quantumide-overlap' | 'user-override';
}

const QUANTUMIDE_COMMAND_PREFIX = 'quantumide.';

export function isQuantumIDECommandId(commandId: string | null): boolean {
	return !!commandId && commandId.startsWith(QUANTUMIDE_COMMAND_PREFIX);
}

function chordKey(item: ResolvedKeybindingItem): string | undefined {
	if (item.chords.length === 0) {
		return undefined;
	}
	return item.chords.join(' ');
}

/** True when two bindings can both be active (neither `when` clause shadows the other). */
export function quantumIDEKeybindingItemsConflict(a: ResolvedKeybindingItem, b: ResolvedKeybindingItem): boolean {
	if (!a.command || !b.command || a.command === b.command) {
		return false;
	}
	const aChord = chordKey(a);
	const bChord = chordKey(b);
	if (!aChord || aChord !== bChord) {
		return false;
	}
	if (KeybindingResolver.whenIsEntirelyIncluded(a.when, b.when)) {
		return false;
	}
	if (KeybindingResolver.whenIsEntirelyIncluded(b.when, a.when)) {
		return false;
	}
	return true;
}

/**
 * Detects keybinding conflicts relevant to QuantumIDE settings (§3.6).
 * Does not flag global chords such as Escape that have many context-scoped bindings.
 */
export function detectQuantumIDEKeybindingConflicts(items: readonly ResolvedKeybindingItem[]): IQuantumIDEKeybindingConflict[] {
	const quantumideItems = items.filter(item => isQuantumIDECommandId(item.command));
	const conflicts: IQuantumIDEKeybindingConflict[] = [];
	const seen = new Set<string>();

	const addConflict = (chord: string, commands: Iterable<string>, reason: IQuantumIDEKeybindingConflict['reason']) => {
		const unique = [...new Set(commands)].sort();
		if (unique.length < 2) {
			return;
		}
		const key = `${chord}|${unique.join('|')}|${reason}`;
		if (seen.has(key)) {
			return;
		}
		seen.add(key);
		conflicts.push({ chord, commands: unique, reason });
	};

	// QuantumIDE command vs QuantumIDE command on the same chord.
	const byChord = new Map<string, ResolvedKeybindingItem[]>();
	for (const item of quantumideItems) {
		const chord = chordKey(item);
		if (!chord || !item.command) {
			continue;
		}
		const group = byChord.get(chord) ?? [];
		group.push(item);
		byChord.set(chord, group);
	}
	for (const [chord, group] of byChord) {
		const commands = new Set<string>();
		for (let i = 0; i < group.length; i++) {
			for (let j = i + 1; j < group.length; j++) {
				if (quantumIDEKeybindingItemsConflict(group[i], group[j])) {
					commands.add(group[i].command!);
					commands.add(group[j].command!);
				}
			}
		}
		addConflict(chord, commands, 'quantumide-overlap');
	}

	// User overrides that collide with a QuantumIDE binding on the same chord.
	const userItems = items.filter(item => !item.isDefault && item.command);
	for (const userItem of userItems) {
		for (const qItem of quantumideItems) {
			if (!quantumIDEKeybindingItemsConflict(userItem, qItem)) {
				continue;
			}
			const chord = chordKey(userItem);
			if (!chord) {
				continue;
			}
			addConflict(chord, [userItem.command!, qItem.command!], 'user-override');
		}
	}

	return conflicts;
}
