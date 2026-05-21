/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

export interface IQuantumIDEDiscoveredTest {
	readonly id: string;
	readonly label: string;
	readonly path?: string;
	readonly framework: 'jest' | 'mocha' | 'vitest' | 'pytest' | 'cargo' | 'go' | 'npm' | 'unknown';
	readonly runCommand?: string;
}

export interface IQuantumIDETestDiscoveryResult {
	readonly tests: readonly IQuantumIDEDiscoveredTest[];
	readonly summary: string;
}

const TEST_FILE_PATTERN = /\.(test|spec)\.(tsx?|jsx?|mjs|cjs)$|_test\.go$|test_.*\.go$/i;

export function discoverTestsFromWorkspaceFiles(filePaths: readonly string[], packageJsonScripts?: Record<string, string>): IQuantumIDETestDiscoveryResult {
	const tests: IQuantumIDEDiscoveredTest[] = [];
	const scripts = packageJsonScripts ?? {};

	if (scripts.test || scripts['test:unit'] || scripts['test:ci']) {
		const scriptText = JSON.stringify(scripts);
		const framework = scriptText.includes('vitest') ? 'vitest' : scriptText.includes('jest') ? 'jest' : 'npm';
		tests.push({
			id: 'npm-test',
			label: 'npm test (package.json)',
			framework,
			runCommand: 'npm test',
		});
	}
	if (scripts.lint) {
		tests.push({
			id: 'npm-lint',
			label: 'npm run lint',
			framework: 'unknown',
			runCommand: 'npm run lint',
		});
	}

	const frameworks = detectFrameworksFromFiles(filePaths);
	if (frameworks.has('jest') && !tests.some(t => t.framework === 'jest')) {
		tests.push({ id: 'jest-suite', label: 'Jest test files', framework: 'jest', runCommand: 'npx jest' });
	}
	if (frameworks.has('vitest') && !tests.some(t => t.framework === 'vitest')) {
		tests.push({ id: 'vitest-suite', label: 'Vitest test files', framework: 'vitest', runCommand: 'npx vitest run' });
	}
	if (frameworks.has('pytest')) {
		tests.push({ id: 'pytest-suite', label: 'pytest', framework: 'pytest', runCommand: 'python -m pytest' });
	}
	if (frameworks.has('cargo')) {
		tests.push({ id: 'cargo-test', label: 'cargo test', framework: 'cargo', runCommand: 'cargo test' });
	}
	if (frameworks.has('go')) {
		tests.push({ id: 'go-test', label: 'go test ./...', framework: 'go', runCommand: 'go test ./...' });
	}

	let fileCount = 0;
	for (const path of filePaths) {
		if (!TEST_FILE_PATTERN.test(path)) {
			continue;
		}
		fileCount++;
		if (tests.length >= 80) {
			break;
		}
		tests.push({
			id: `file:${path}`,
			label: path,
			path,
			framework: path.endsWith('.py') ? 'pytest' : path.endsWith('.go') ? 'go' : 'unknown',
		});
	}

	const summary = [
		`Discovered ${tests.length} runnable target(s)`,
		fileCount > 0 ? `including ${fileCount} test file path(s)` : '',
	].filter(Boolean).join(', ');
	return { tests, summary };
}

function detectFrameworksFromFiles(filePaths: readonly string[]): Set<string> {
	const frameworks = new Set<string>();
	for (const path of filePaths) {
		if (path.includes('jest.config') || path.includes('jest.setup')) {
			frameworks.add('jest');
		}
		if (path.includes('vitest.config')) {
			frameworks.add('vitest');
		}
		if (path.includes('pytest.ini') || path.includes('conftest.py')) {
			frameworks.add('pytest');
		}
		if (path.endsWith('Cargo.toml')) {
			frameworks.add('cargo');
		}
		if (path.endsWith('_test.go') || path.includes('/testdata/')) {
			frameworks.add('go');
		}
	}
	return frameworks;
}

export function formatDiscoveredTests(result: IQuantumIDETestDiscoveryResult): string {
	const lines = [result.summary, ''];
	for (const test of result.tests.slice(0, 50)) {
		lines.push(`- [${test.framework}] ${test.label}${test.runCommand ? ` → \`${test.runCommand}\`` : ''}`);
	}
	if (result.tests.length > 50) {
		lines.push(`- ...${result.tests.length - 50} more omitted`);
	}
	return lines.join('\n');
}
