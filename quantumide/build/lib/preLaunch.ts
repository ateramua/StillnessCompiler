/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import path from 'path';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const rootDir = path.resolve(import.meta.dirname, '..', '..');

/**
 * Parent `npm run ...` (npm >= 11.2) exports npm user-agent into the environment. Child processes
 * can use the correct Node/npm on PATH while still inheriting that stale UA; build/lib/electron.ts
 * gates on it. Drop inherited UA so Electron download matches the actual toolchain.
 */
function envWithoutInheritedNpmUserAgent(base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
	const env = { ...base };
	delete env.npm_config_user_agent;
	delete env.NPM_CONFIG_USER_AGENT;
	return env;
}

function runProcess(command: string, args: ReadonlyArray<string> = [], env: NodeJS.ProcessEnv = process.env) {
	return new Promise<void>((resolve, reject) => {
		const child = spawn(command, args, { cwd: rootDir, stdio: 'inherit', env, shell: process.platform === 'win32' });
		child.on('exit', err => !err ? resolve() : process.exit(err ?? 1));
		child.on('error', reject);
	});
}

async function exists(subdir: string) {
	try {
		await fs.stat(path.join(rootDir, subdir));
		return true;
	} catch {
		return false;
	}
}

async function ensureNodeModules() {
	if (!(await exists('node_modules'))) {
		await runProcess(npm, ['ci']);
	}
}

async function getElectron() {
	// Invoke electron.ts directly so launch works when `npm` on PATH is >= 11.2
	// (npm run … still injects npm_config_user_agent into this process; strip it for the download step).
	await runProcess(process.execPath, ['build/lib/electron.ts'], envWithoutInheritedNpmUserAgent(process.env));
	await assertDarwinElectronFramework();
}

async function assertDarwinElectronFramework(): Promise<void> {
	if (process.platform !== 'darwin') {
		return;
	}
	const product = JSON.parse(await fs.readFile(path.join(rootDir, 'product.json'), 'utf8')) as { nameLong: string };
	const frameworkBinary = path.join(
		rootDir,
		'.build',
		'electron',
		`${product.nameLong}.app`,
		'Contents',
		'Frameworks',
		'Electron Framework.framework',
		'Versions',
		'A',
		'Electron Framework',
	);
	try {
		await fs.access(frameworkBinary);
	} catch {
		throw new Error(
			`Electron app is incomplete (missing "${path.relative(rootDir, frameworkBinary)}"). ` +
			`Your Node/npm likely broke extraction (use npm < 11.2). Fix:\n` +
			`  rm -rf .build/electron\n` +
			`  ./scripts/ensure-node22.sh node build/lib/electron.ts\n` +
			`  ./scripts/ensure-node22.sh ./scripts/code.sh\n` +
			`Current: Node ${process.version}`
		);
	}
}

async function ensureCompiled() {
	if (!(await exists('out'))) {
		await runProcess(npm, ['run', 'compile']);
	}
}

/** Built-in chat extension (extensions/copilot) uses esbuild; root `compile` does not emit `dist/`. */
async function ensureCopilotExtensionCompiled() {
	const copilotDistMain = path.join(rootDir, 'extensions', 'copilot', 'dist', 'extension.js');
	try {
		await fs.access(copilotDistMain);
		return;
	} catch {
		// missing dist — extension activation would fail
	}
	console.log('[preLaunch] Building built-in chat extension (extensions/copilot → dist/)...');
	await runProcess(npm, ['--prefix', 'extensions/copilot', 'run', 'compile']);
}

async function main() {
	await ensureNodeModules();
	await getElectron();
	await ensureCompiled();
	await ensureCopilotExtensionCompiled();

	// Can't require this until after dependencies are installed
	const { getBuiltInExtensions } = await import('./builtInExtensions.ts');
	await getBuiltInExtensions();
}

if (import.meta.main) {
	main().catch(err => {
		console.error(err);
		process.exit(1);
	});
}
