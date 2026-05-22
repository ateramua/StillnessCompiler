/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/** Browser-style long task threshold (§13.6 / AC-01-06). */
export const QUANTUMIDE_MAIN_THREAD_LONG_TASK_MS = 50;

let _sessionActive = false;
let _sessionDepth = 0;
let _longTaskCount = 0;
let _totalSliceMs = 0;

export function beginQuantumIDEIndexingMainThreadSession(): void {
	if (_sessionDepth === 0) {
		_longTaskCount = 0;
		_totalSliceMs = 0;
	}
	_sessionDepth++;
	_sessionActive = true;
}

export function endQuantumIDEIndexingMainThreadSession(): void {
	if (_sessionDepth <= 0) {
		return;
	}
	_sessionDepth--;
	if (_sessionDepth === 0) {
		_sessionActive = false;
	}
}

export function recordQuantumIDEIndexingMainThreadSlice(durationMs: number): void {
	if (!_sessionActive) {
		return;
	}
	_totalSliceMs += durationMs;
	if (durationMs >= QUANTUMIDE_MAIN_THREAD_LONG_TASK_MS) {
		_longTaskCount++;
	}
}

export function getQuantumIDEIndexingMainThreadLongTaskCount(): number {
	return _longTaskCount;
}

export function resetQuantumIDEIndexingMainThreadMetrics(): void {
	_longTaskCount = 0;
	_totalSliceMs = 0;
	_sessionActive = false;
	_sessionDepth = 0;
}
