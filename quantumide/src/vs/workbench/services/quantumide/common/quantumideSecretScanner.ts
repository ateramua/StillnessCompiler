/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export interface IQuantumIDESecretScanHit {
	readonly path: string;
	readonly line: number;
	readonly rule: string;
	readonly snippet: string;
}

export interface IQuantumIDESecretScannerService {
	readonly _serviceBrand: undefined;
	scanWorkspace(maxHits?: number): Promise<readonly IQuantumIDESecretScanHit[]>;
}

export const IQuantumIDESecretScannerService = createDecorator<IQuantumIDESecretScannerService>('quantumIDESecretScannerService');

/** Patterns aligned with common secret scanners (high signal, low false-positive). */
export const QUANTUMIDE_SECRET_SCAN_RULES: readonly { rule: string; pattern: RegExp }[] = [
	{ rule: 'aws-access-key', pattern: /AKIA[0-9A-Z]{16}/ },
	{ rule: 'openai-key', pattern: /sk-[A-Za-z0-9]{20,}/ },
	{ rule: 'github-token', pattern: /ghp_[A-Za-z0-9]{36,}/ },
	{ rule: 'generic-api-key', pattern: /(?:api[_-]?key|apikey)\s*[=:]\s*['"]?[A-Za-z0-9_\-]{16,}/i },
	{ rule: 'private-key-block', pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
];
