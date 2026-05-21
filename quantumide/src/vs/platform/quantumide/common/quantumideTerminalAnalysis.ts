/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

export interface IQuantumIDETerminalInsight {
	readonly kind: 'error' | 'stack' | 'warning' | 'info';
	readonly line: string;
	readonly file?: string;
	readonly lineNumber?: number;
	readonly column?: number;
	readonly suggestion?: string;
}

const STACK_FRAME = /^\s*at\s+(?:async\s+)?(?:.*?\s+)?\(?(.+?):(\d+):(\d+)\)?/;
const TS_ERROR = /^(.*)\((\d+),(\d+)\):\s+error\s+TS\d+:\s+(.*)$/i;
const NODE_ERROR = /^(.*):(\d+):(\d+)\s*$/;
const GENERIC_ERROR = /error|failed|✖|ERR!/i;

export function analyzeTerminalOutput(output: string, maxInsights = 24): IQuantumIDETerminalInsight[] {
	const insights: IQuantumIDETerminalInsight[] = [];
	const lines = output.split(/\r?\n/);
	for (const line of lines) {
		if (insights.length >= maxInsights) {
			break;
		}
		const trimmed = line.trim();
		if (!trimmed) {
			continue;
		}
		const stack = trimmed.match(STACK_FRAME);
		if (stack) {
			insights.push({
				kind: 'stack',
				line: trimmed,
				file: stack[1],
				lineNumber: Number(stack[2]),
				column: Number(stack[3]),
				suggestion: 'Inspect the stack frame file and line for the failure origin.',
			});
			continue;
		}
		const ts = trimmed.match(TS_ERROR);
		if (ts) {
			insights.push({
				kind: 'error',
				line: trimmed,
				file: ts[1],
				lineNumber: Number(ts[2]),
				column: Number(ts[3]),
				suggestion: `Fix TypeScript error: ${ts[4]}`,
			});
			continue;
		}
		if (GENERIC_ERROR.test(trimmed)) {
			const node = trimmed.match(NODE_ERROR);
			insights.push({
				kind: 'error',
				line: trimmed,
				file: node?.[1],
				lineNumber: node ? Number(node[2]) : undefined,
				column: node ? Number(node[3]) : undefined,
				suggestion: 'Review compiler/test output and patch the reported location.',
			});
		}
	}
	return insights;
}

export function formatTerminalInsights(insights: readonly IQuantumIDETerminalInsight[]): string {
	if (insights.length === 0) {
		return 'No structured errors detected in terminal output.';
	}
	return insights.map(i => {
		const loc = i.file ? `${i.file}${i.lineNumber ? `:${i.lineNumber}` : ''}` : '';
		return `- [${i.kind}] ${loc ? `${loc} — ` : ''}${i.line}${i.suggestion ? `\n  Suggestion: ${i.suggestion}` : ''}`;
	}).join('\n');
}
