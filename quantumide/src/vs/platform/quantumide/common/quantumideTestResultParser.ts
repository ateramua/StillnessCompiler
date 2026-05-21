/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

export interface IQuantumIDETestRunSummary {
	readonly summary: string;
	readonly passed: number;
	readonly failed: number;
	readonly detail: string;
}

export function parseQuantumIDETestOutput(output: string): IQuantumIDETestRunSummary {
	const lines = output.split(/\r?\n/);
	let passed = 0;
	let failed = 0;

	const vitest = output.match(/Tests\s+(\d+)\s+passed(?:\s*\|\s*(\d+)\s+failed)?/i);
	if (vitest) {
		passed = Number(vitest[1]) || 0;
		failed = Number(vitest[2]) || 0;
	}

	const jest = output.match(/Tests:\s+(\d+)\s+failed,\s+(\d+)\s+passed/i)
		?? output.match(/Tests:\s+(\d+)\s+passed,\s+(\d+)\s+failed/i)
		?? output.match(/Tests:\s+(\d+)\s+passed/i);
	if (jest) {
		if (/failed,\s+\d+\s+passed/i.test(output)) {
			failed = Number(jest[1]) || 0;
			passed = Number(jest[2]) || 0;
		} else if (/\d+\s+passed,\s+\d+\s+failed/i.test(output)) {
			passed = Number(jest[1]) || 0;
			failed = Number(jest[2]) || 0;
		} else {
			passed = Number(jest[1]) || 0;
		}
	}

	for (const line of lines) {
		const m = line.match(/^\s*✓|^\s*PASS\b|^\s*ok\s+\d+/i);
		if (m) {
			passed++;
		}
		const f = line.match(/^\s*✗|^\s*FAIL\b|^\s*not ok\s+\d+/i);
		if (f) {
			failed++;
		}
	}

	if (passed === 0 && failed === 0) {
		const passCount = (output.match(/\bpassed\b/gi) ?? []).length;
		const failCount = (output.match(/\bfailed\b/gi) ?? []).length;
		passed = passCount;
		failed = failCount;
	}

	const summary = failed > 0
		? `${failed} test(s) failed`
		: passed > 0
			? `${passed} test(s) passed`
			: 'Test run finished';

	return { summary, passed, failed, detail: output };
}
