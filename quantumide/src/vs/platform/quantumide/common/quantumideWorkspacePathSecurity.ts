/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { isEqualOrParent } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';

/** Reject path traversal segments before resolving against workspace roots. */
export function assertSafeWorkspaceRelativePath(pathArg: string): void {
	const normalized = pathArg.trim().replace(/\\/g, '/');
	if (!normalized || normalized === '.' || normalized === '..') {
		throw new Error('Path is required.');
	}
	const segments = normalized.split('/');
	for (const segment of segments) {
		if (segment === '..') {
			throw new Error('Path must not contain parent directory segments (..).');
		}
	}
}

export function isUriUnderWorkspaceRoots(uri: URI, roots: readonly URI[]): boolean {
	if (roots.length === 0) {
		return false;
	}
	for (const root of roots) {
		if (isEqualOrParent(uri, root)) {
			return true;
		}
	}
	return false;
}
