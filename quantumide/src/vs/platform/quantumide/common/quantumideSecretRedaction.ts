/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

const SECRET_PATTERNS: readonly RegExp[] = [
	/\b(sk-[a-zA-Z0-9]{20,})\b/g,
	/\b(ghp_[a-zA-Z0-9]{20,})\b/g,
	/\b(xox[baprs]-[a-zA-Z0-9-]{10,})\b/g,
	/\b(AKIA[0-9A-Z]{16})\b/g,
	/(api[_-]?key\s*[:=]\s*)([^\s'"]+)/gi,
	/(Bearer\s+)([a-zA-Z0-9._-]+)/gi,
	/(password\s*[:=]\s*)([^\s'"]+)/gi,
];

const ENV_PATH_PATTERN = /(^|\n)(\.env(\.\w+)?)(\s|$)/gi;

export function redactQuantumIDESecrets(text: string): string {
	let out = text;
	for (const pattern of SECRET_PATTERNS) {
		out = out.replace(pattern, (_m, g1?: string, g2?: string) => {
			if (g2 !== undefined) {
				return `${g1}[REDACTED]`;
			}
			return '[REDACTED]';
		});
	}
	return out;
}

export function containsSensitiveEnvPath(text: string): boolean {
	ENV_PATH_PATTERN.lastIndex = 0;
	return ENV_PATH_PATTERN.test(text);
}
