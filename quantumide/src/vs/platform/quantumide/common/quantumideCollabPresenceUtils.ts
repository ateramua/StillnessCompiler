/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

export interface IQuantumIDECollabPresenceLike {
	readonly id?: string;
	readonly lastSeen: number;
	readonly presence?: {
		readonly resource?: string;
		readonly line?: number;
		readonly column?: number;
	};
}

export function isCollabPresenceStale(lastSeen: number, now: number, staleMs: number): boolean {
	return now - lastSeen > staleMs;
}

export function filterActiveCollabParticipants<T extends IQuantumIDECollabPresenceLike>(
	participants: readonly T[],
	selfId: string,
	now: number,
	staleMs: number,
	resource?: string,
): readonly T[] {
	return participants.filter(p => {
		if (p.lastSeen === undefined || isCollabPresenceStale(p.lastSeen, now, staleMs)) {
			return false;
		}
		if (p.presence?.resource && resource && p.presence.resource !== resource) {
			return false;
		}
		return p.id !== selfId;
	});
}
