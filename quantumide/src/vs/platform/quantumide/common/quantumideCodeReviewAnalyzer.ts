/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

export type QuantumIDECodeReviewSeverity = 'critical' | 'warning' | 'info' | 'suggestion';

export interface IQuantumIDECodeReviewFinding {
	readonly severity: QuantumIDECodeReviewSeverity;
	readonly path?: string;
	readonly line?: number;
	readonly category: string;
	readonly message: string;
	readonly suggestion?: string;
}

export interface IQuantumIDECodeReviewReport {
	readonly summary: string;
	readonly findings: readonly IQuantumIDECodeReviewFinding[];
	readonly stats: { critical: number; warning: number; info: number; suggestion: number };
}

const REVIEW_PATTERNS: { pattern: RegExp; category: string; severity: QuantumIDECodeReviewSeverity; message: string; suggestion?: string }[] = [
	{ pattern: /eval\s*\(/, category: 'security', severity: 'critical', message: 'Use of eval() is a security risk.', suggestion: 'Refactor to avoid dynamic code execution.' },
	{ pattern: /innerHTML\s*=/, category: 'security', severity: 'warning', message: 'Direct innerHTML assignment may enable XSS.', suggestion: 'Use textContent or a sanitization library.' },
	{ pattern: /password\s*=\s*['"][^'"]+['"]/, category: 'security', severity: 'critical', message: 'Hardcoded password detected.', suggestion: 'Move secrets to environment variables.' },
	{ pattern: /console\.log\s*\(/, category: 'style', severity: 'info', message: 'Debug console.log left in code.', suggestion: 'Remove or replace with structured logging.' },
	{ pattern: /TODO|FIXME|HACK/, category: 'maintainability', severity: 'info', message: 'Unresolved TODO/FIXME comment.', suggestion: 'Track in issue tracker or resolve before merge.' },
	{ pattern: /any\b/, category: 'typescript', severity: 'suggestion', message: 'Use of `any` reduces type safety.', suggestion: 'Prefer explicit types or unknown + narrowing.' },
	{ pattern: /catch\s*\(\s*\)\s*\{/, category: 'reliability', severity: 'warning', message: 'Empty catch block swallows errors.', suggestion: 'Log or rethrow with context.' },
	{ pattern: /\.then\s*\([^)]*\)\s*\.catch\s*\(\s*\(\)\s*=>\s*\{\s*\}\s*\)/, category: 'reliability', severity: 'warning', message: 'Promise rejection silently ignored.', suggestion: 'Handle errors explicitly.' },
];

export function analyzeCodeForReview(path: string, content: string): IQuantumIDECodeReviewFinding[] {
	const findings: IQuantumIDECodeReviewFinding[] = [];
	const lines = content.split(/\r?\n/);
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		for (const rule of REVIEW_PATTERNS) {
			if (rule.pattern.test(line)) {
				findings.push({
					severity: rule.severity,
					path,
					line: i + 1,
					category: rule.category,
					message: rule.message,
					suggestion: rule.suggestion,
				});
			}
		}
	}
	if (content.length > 800 && !content.includes('test') && /\.(ts|tsx|js|jsx|py)$/.test(path)) {
		findings.push({
			severity: 'suggestion',
			path,
			category: 'testing',
			message: 'Large source file without obvious test references.',
			suggestion: 'Consider adding unit tests for critical paths.',
		});
	}
	return findings;
}

export function buildCodeReviewReport(
	files: readonly { path: string; content: string; status?: string }[],
): IQuantumIDECodeReviewReport {
	const all: IQuantumIDECodeReviewFinding[] = [];
	for (const file of files) {
		all.push(...analyzeCodeForReview(file.path, file.content));
	}
	const stats = { critical: 0, warning: 0, info: 0, suggestion: 0 };
	for (const f of all) {
		stats[f.severity]++;
	}
	const summary = all.length === 0
		? 'No automated issues detected. Review logic, edge cases, and API contracts manually.'
		: `Found ${all.length} issue(s): ${stats.critical} critical, ${stats.warning} warning, ${stats.info} info, ${stats.suggestion} suggestion.`;
	return { summary, findings: all.slice(0, 50), stats };
}

export function formatCodeReviewReport(report: IQuantumIDECodeReviewReport): string {
	const lines = [report.summary, ''];
	for (const f of report.findings) {
		const loc = f.path ? `${f.path}${f.line ? `:${f.line}` : ''}` : '';
		lines.push(`- [${f.severity.toUpperCase()}] ${f.category}${loc ? ` @ ${loc}` : ''}: ${f.message}`);
		if (f.suggestion) {
			lines.push(`  → ${f.suggestion}`);
		}
	}
	return lines.join('\n');
}
