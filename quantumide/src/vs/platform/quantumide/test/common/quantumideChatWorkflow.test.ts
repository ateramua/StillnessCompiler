/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { buildProjectScaffold, detectScaffoldKindFromPrompt, formatScaffoldPlan } from '../../common/quantumideProjectScaffold.js';
import { buildGitCommand } from '../../common/quantumideGitOperations.js';
import { buildDependencyCommand, detectPackageManager } from '../../common/quantumideDependencyManager.js';
import { runFrameworkWorkflow, formatFrameworkWorkflowResult } from '../../common/quantumideFrameworkWorkflows.js';
import { buildCodeReviewReport, formatCodeReviewReport } from '../../common/quantumideCodeReviewAnalyzer.js';

suite('quantumideProjectScaffold', () => {
	test('detects Next.js from prompt', () => {
		assert.strictEqual(detectScaffoldKindFromPrompt('Create a new Next.js project'), 'nextjs');
	});

	test('builds scaffold with package.json', () => {
		const plan = buildProjectScaffold('react-vite', 'demo');
		assert.ok(plan.files.some(f => f.path === 'package.json'));
		assert.ok(formatScaffoldPlan(plan).includes('demo'));
	});
});

suite('quantumideGitOperations', () => {
	test('commit requires message', () => {
		assert.throws(() => buildGitCommand('commit', {}));
	});

	test('status is read-only', () => {
		const spec = buildGitCommand('status');
		assert.strictEqual(spec.requiresWrite, false);
	});
});

suite('quantumideDependencyManager', () => {
	test('detects pnpm from lockfile', () => {
		assert.strictEqual(detectPackageManager(['pnpm-lock.yaml']), 'pnpm');
	});

	test('add requires package name', () => {
		assert.throws(() => buildDependencyCommand('add', 'npm', {}));
	});
});

suite('quantumideFrameworkWorkflows', () => {
	test('add react component', () => {
		const result = runFrameworkWorkflow('add_react_component', { name: 'Button' });
		assert.ok(formatFrameworkWorkflowResult(result).includes('Button'));
	});
});

suite('quantumideCodeReviewAnalyzer', () => {
	test('flags eval usage', () => {
		const report = buildCodeReviewReport([{ path: 'a.ts', content: 'eval("bad")' }]);
		assert.ok(report.stats.critical >= 1);
		assert.ok(formatCodeReviewReport(report).includes('eval'));
	});
});
