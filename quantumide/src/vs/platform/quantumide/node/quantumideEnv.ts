/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { existsSync, readFileSync } from 'fs';
import { join, resolve } from '../../../base/common/path.js';
import { IProcessEnvironment } from '../../../base/common/platform.js';
import { QuantumIDEOpenAIBaseUrlEnvVar, QuantumIDEOpenAIApiKeyEnvVar } from '../common/quantumideAISettings.js';

const QUANTUMIDE_ENV_KEYS = new Set([
	QuantumIDEOpenAIApiKeyEnvVar,
	QuantumIDEOpenAIBaseUrlEnvVar,
	'QUANTUMIDE_OPENAI_MODEL',
]);

export function readQuantumIDEEnvFiles(candidateDirectories: readonly string[], existingEnv: IProcessEnvironment): IProcessEnvironment {
	const result: IProcessEnvironment = {};
	const seen = new Set<string>();
	for (const directory of candidateDirectories) {
		const envFile = resolve(directory, '.env');
		if (seen.has(envFile)) {
			continue;
		}
		seen.add(envFile);
		Object.assign(result, readQuantumIDEEnvFile(envFile, existingEnv, result));
	}
	return result;
}

export function getQuantumIDEEnvCandidateDirectories(appRoot: string, userDataPath: string): string[] {
	return [
		process.cwd(),
		appRoot,
		join(appRoot, '..'),
		join(appRoot, '..', '..'),
		userDataPath,
		join(userDataPath, 'User'),
	];
}

function readQuantumIDEEnvFile(envFile: string, existingEnv: IProcessEnvironment, pendingEnv: IProcessEnvironment): IProcessEnvironment {
	if (!existsSync(envFile)) {
		return {};
	}
	const result: IProcessEnvironment = {};
	for (const rawLine of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith('#')) {
			continue;
		}
		const normalized = line.startsWith('export ') ? line.slice('export '.length).trim() : line;
		const equalsIndex = normalized.indexOf('=');
		if (equalsIndex <= 0) {
			continue;
		}
		const key = normalized.slice(0, equalsIndex).trim();
		if (!QUANTUMIDE_ENV_KEYS.has(key) || existingEnv[key] !== undefined || pendingEnv[key] !== undefined) {
			continue;
		}
		result[key] = unquoteEnvValue(normalized.slice(equalsIndex + 1).trim());
	}
	return result;
}

function unquoteEnvValue(value: string): string {
	if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
		return value.slice(1, -1);
	}
	return value;
}
