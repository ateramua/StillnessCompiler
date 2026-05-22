/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Browser/Electron errors that are noisy but not actionable — do not surface as QuantumIDE toasts.
 */
export function isBenignQuantumIDERendererError(message: string | undefined | null): boolean {
	if (!message) {
		return true;
	}
	const msg = message.trim();
	if (msg.includes('ResizeObserver loop')) {
		return true;
	}
	if (msg === 'Script error.' || msg === 'Script error') {
		return true;
	}
	return false;
}
