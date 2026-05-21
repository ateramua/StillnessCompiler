/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

export type QuantumIDEPackageManager = 'npm' | 'pnpm' | 'yarn';

export type QuantumIDEDependencyAction = 'install' | 'add' | 'remove' | 'upgrade' | 'audit' | 'list';

export interface IQuantumIDEDependencyCommandSpec {
	readonly manager: QuantumIDEPackageManager;
	readonly command: string;
	readonly args: readonly string[];
	readonly requiresNetwork: boolean;
	readonly modifiesLockfile: boolean;
}

export interface IQuantumIDEDependencyOperationResult {
	readonly action: QuantumIDEDependencyAction;
	readonly packageName?: string;
	readonly success: boolean;
	readonly stdout: string;
	readonly stderr: string;
	readonly exitCode: number;
}

export function detectPackageManager(lockFiles: readonly string[]): QuantumIDEPackageManager {
	const names = lockFiles.map(f => f.toLowerCase());
	if (names.some(f => f.endsWith('pnpm-lock.yaml'))) {
		return 'pnpm';
	}
	if (names.some(f => f.endsWith('yarn.lock'))) {
		return 'yarn';
	}
	return 'npm';
}

export function buildDependencyCommand(
	action: QuantumIDEDependencyAction,
	manager: QuantumIDEPackageManager,
	options: { packageName?: string; dev?: boolean; version?: string } = {},
): IQuantumIDEDependencyCommandSpec {
	const pkg = options.packageName?.trim();
	const devFlag = options.dev ? (manager === 'npm' ? '--save-dev' : '-D') : '';
	switch (action) {
		case 'install':
			return { manager, command: manager, args: manager === 'yarn' ? ['install'] : ['install'], requiresNetwork: true, modifiesLockfile: true };
		case 'add':
			if (!pkg) {
				throw new Error('add requires packageName.');
			}
			if (manager === 'npm') {
				return { manager, command: 'npm', args: ['install', pkg + (options.version ? `@${options.version}` : ''), ...(devFlag ? [devFlag] : [])], requiresNetwork: true, modifiesLockfile: true };
			}
			if (manager === 'pnpm') {
				return { manager, command: 'pnpm', args: ['add', pkg + (options.version ? `@${options.version}` : ''), ...(options.dev ? ['-D'] : [])], requiresNetwork: true, modifiesLockfile: true };
			}
			return { manager, command: 'yarn', args: ['add', pkg + (options.version ? `@${options.version}` : ''), ...(options.dev ? ['-D'] : [])], requiresNetwork: true, modifiesLockfile: true };
		case 'remove':
			if (!pkg) {
				throw new Error('remove requires packageName.');
			}
			return { manager, command: manager, args: manager === 'npm' ? ['uninstall', pkg] : manager === 'pnpm' ? ['remove', pkg] : ['remove', pkg], requiresNetwork: true, modifiesLockfile: true };
		case 'upgrade':
			if (!pkg) {
				throw new Error('upgrade requires packageName.');
			}
			if (manager === 'npm') {
				return { manager, command: 'npm', args: ['install', `${pkg}@latest`], requiresNetwork: true, modifiesLockfile: true };
			}
			return { manager, command: manager, args: manager === 'pnpm' ? ['update', pkg, '--latest'] : ['upgrade', pkg, '--latest'], requiresNetwork: true, modifiesLockfile: true };
		case 'audit':
			return { manager, command: manager, args: manager === 'yarn' ? ['audit'] : ['audit'], requiresNetwork: true, modifiesLockfile: false };
		case 'list':
			return { manager, command: manager, args: manager === 'npm' ? ['ls', '--depth=0'] : manager === 'pnpm' ? ['list', '--depth=0'] : ['list', '--depth=0'], requiresNetwork: false, modifiesLockfile: false };
		default:
			return { manager, command: manager, args: ['install'], requiresNetwork: true, modifiesLockfile: true };
	}
}

export function formatDependencyResult(result: IQuantumIDEDependencyOperationResult): string {
	const out = [result.stdout, result.stderr].filter(Boolean).join('\n').trim().slice(-8000);
	const label = result.packageName ? `${result.action} ${result.packageName}` : result.action;
	const status = result.success ? 'OK' : `FAILED (exit ${result.exitCode})`;
	return [`Dependency ${label}: ${status}`, out || '(no output)'].join('\n\n');
}
