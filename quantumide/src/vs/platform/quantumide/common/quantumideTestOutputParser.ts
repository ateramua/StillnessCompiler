/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

export interface IQuantumIDETestRunSummary {
	readonly framework: 'jest' | 'vitest' | 'pytest' | 'mocha' | 'unknown';
	readonly passed: number;
	readonly failed: number;
	readonly skipped: number;
	readonly total: number;
	readonly durationMs?: number;
	readonly failures: readonly { file?: string; line?: number; testName: string; message?: string }[];
}

export function parseTestOutput(output: string, hint?: string): IQuantumIDETestRunSummary {
	const framework = detectTestFramework(output, hint);
	switch (framework) {
		case 'vitest':
			return parseVitestOutput(output);
		case 'jest':
			return parseJestOutput(output);
		case 'pytest':
			return parsePytestOutput(output);
		case 'mocha':
			return parseMochaOutput(output);
		default:
			return parseGenericOutput(output);
	}
}

function detectTestFramework(output: string, hint?: string): IQuantumIDETestRunSummary['framework'] {
	const h = (hint ?? '').toLowerCase();
	if (h.includes('vitest') || /vitest.*\d+ passed/i.test(output)) {
		return 'vitest';
	}
	if (h.includes('jest') || /jest.*\d+ passed/i.test(output) || /Test Suites:/.test(output)) {
		return 'jest';
	}
	if (h.includes('pytest') || /=+ FAILURES =+/.test(output) || /passed.*failed/i.test(output) && /pytest/.test(output)) {
		return 'pytest';
	}
	if (h.includes('mocha') || /\d+ passing/.test(output)) {
		return 'mocha';
	}
	if (/Tests\s+\d+\s+passed/.test(output) && /vitest/i.test(output)) {
		return 'vitest';
	}
	if (/Test Suites:/.test(output)) {
		return 'jest';
	}
	if (/\d+ passed/.test(output) && /pytest/.test(output)) {
		return 'pytest';
	}
	return 'unknown';
}

function parseVitestOutput(output: string): IQuantumIDETestRunSummary {
	const summary = output.match(/Tests\s+(\d+)\s+passed(?:\s*\|\s*(\d+)\s+failed)?(?:\s*\|\s*(\d+)\s+skipped)?/i)
		?? output.match(/(\d+)\s+passed(?:,\s*(\d+)\s+failed)?/i);
	const failedMatch = output.match(/(\d+)\s+failed/i);
	const passed = summary ? Number(summary[1]) : countMatches(output, /✓|PASS\s/g);
	const failed = summary?.[2] ? Number(summary[2]) : failedMatch ? Number(failedMatch[1]) : countMatches(output, /✗|FAIL\s/g);
	const skipped = summary?.[3] ? Number(summary[3]) : 0;
	const failures = extractFailureBlocks(output);
	const duration = extractDurationMs(output);
	return buildSummary('vitest', passed, failed, skipped, failures, duration);
}

function parseJestOutput(output: string): IQuantumIDETestRunSummary {
	const suites = output.match(/Tests:\s+(\d+) failed,\s*(\d+) passed,\s*(\d+) total/);
	if (suites) {
		const failed = Number(suites[1]);
		const passed = Number(suites[2]);
		const total = Number(suites[3]);
		const skipped = Math.max(0, total - passed - failed);
		return buildSummary('jest', passed, failed, skipped, extractFailureBlocks(output), extractDurationMs(output));
	}
	const alt = output.match(/Tests:\s+(\d+) passed,\s*(\d+) total/);
	const passed = alt ? Number(alt[1]) : 0;
	const total = alt ? Number(alt[2]) : passed;
	return buildSummary('jest', passed, Math.max(0, total - passed), 0, extractFailureBlocks(output), extractDurationMs(output));
}

function parsePytestOutput(output: string): IQuantumIDETestRunSummary {
	const summary = output.match(/(\d+) passed(?:,\s*(\d+) failed)?(?:,\s*(\d+) skipped)?/);
	const passed = summary ? Number(summary[1]) : 0;
	const failed = summary?.[2] ? Number(summary[2]) : countMatches(output, /FAILED\s/g);
	const skipped = summary?.[3] ? Number(summary[3]) : 0;
	const failures: { file?: string; line?: number; testName: string; message?: string }[] = [];
	for (const line of output.split('\n')) {
		const m = line.match(/^FAILED\s+(.+?)(?:\s+-\s+(.+))?$/);
		if (m) {
			const loc = m[1].match(/(.+):(\d+):/);
			failures.push({
				testName: m[1],
				file: loc?.[1],
				line: loc?.[2] ? Number(loc[2]) : undefined,
				message: m[2],
			});
		}
	}
	return buildSummary('pytest', passed, failed, skipped, failures, extractDurationMs(output));
}

function parseMochaOutput(output: string): IQuantumIDETestRunSummary {
	const passing = output.match(/(\d+)\s+passing/);
	const failing = output.match(/(\d+)\s+failing/);
	const passed = passing ? Number(passing[1]) : 0;
	const failed = failing ? Number(failing[1]) : 0;
	return buildSummary('mocha', passed, failed, 0, extractFailureBlocks(output), extractDurationMs(output));
}

function parseGenericOutput(output: string): IQuantumIDETestRunSummary {
	const passed = countMatches(output, /\bpassed\b/gi);
	const failed = countMatches(output, /\bfailed\b/gi);
	return buildSummary('unknown', passed, failed, 0, extractFailureBlocks(output), extractDurationMs(output));
}

function buildSummary(
	framework: IQuantumIDETestRunSummary['framework'],
	passed: number,
	failed: number,
	skipped: number,
	failures: IQuantumIDETestRunSummary['failures'],
	durationMs?: number,
): IQuantumIDETestRunSummary {
	return {
		framework,
		passed,
		failed,
		skipped,
		total: passed + failed + skipped,
		durationMs,
		failures: failures.slice(0, 20),
	};
}

function extractFailureBlocks(output: string): IQuantumIDETestRunSummary['failures'] {
	const failures: { file?: string; line?: number; testName: string; message?: string }[] = [];
	for (const line of output.split('\n')) {
		const fail = line.match(/(?:FAIL|✗)\s+(.+)/) ?? line.match(/●\s+(.+)/);
		if (fail) {
			failures.push({ testName: fail[1].trim() });
		}
		const at = line.match(/at\s+.+?\((.+):(\d+):\d+\)/);
		if (at && failures.length > 0) {
			const last = failures[failures.length - 1];
			failures[failures.length - 1] = { ...last, file: at[1], line: Number(at[2]) };
		}
	}
	return failures;
}

function extractDurationMs(output: string): number | undefined {
	const m = output.match(/(?:Time|Duration):\s*([\d.]+)\s*s/i) ?? output.match(/in\s+([\d.]+)\s*s/i);
	return m ? Math.round(Number(m[1]) * 1000) : undefined;
}

function countMatches(text: string, pattern: RegExp): number {
	const m = text.match(pattern);
	return m?.length ?? 0;
}

export function formatTestRunSummary(summary: IQuantumIDETestRunSummary): string {
	const lines = [
		`**${summary.framework}** — ${summary.passed} passed, ${summary.failed} failed, ${summary.skipped} skipped (${summary.total} total)`,
	];
	if (summary.durationMs !== undefined) {
		lines.push(`Duration: ${(summary.durationMs / 1000).toFixed(2)}s`);
	}
	for (const f of summary.failures.slice(0, 8)) {
		const loc = f.file ? ` (${f.file}${f.line ? `:${f.line}` : ''})` : '';
		lines.push(`- ✗ ${f.testName}${loc}${f.message ? `: ${f.message}` : ''}`);
	}
	return lines.join('\n');
}
