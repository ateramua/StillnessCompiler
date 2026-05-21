/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

export type QuantumIDEIndexingScaleProfile = 'standard' | 'enterprise';

export const QUANTUMIDE_INDEX_SCALE_STANDARD = {
	maxFiles: 500,
	maxFileChars: 48_000,
	maxScanDepth: 6,
	indexBatchSize: 50,
	indexYieldMs: 0,
} as const;

export const QUANTUMIDE_INDEX_SCALE_ENTERPRISE = {
	maxFiles: 50_000,
	maxFileChars: 200_000,
	maxScanDepth: 14,
	indexBatchSize: 200,
	indexYieldMs: 4,
} as const;

export function resolveQuantumIDEIndexScaleLimits(profile: string | undefined, configuredMaxFiles?: number, configuredMaxFileChars?: number): {
	readonly maxFiles: number;
	readonly maxFileChars: number;
	readonly maxScanDepth: number;
	readonly indexBatchSize: number;
	readonly indexYieldMs: number;
	readonly profile: QuantumIDEIndexingScaleProfile;
} {
	const isEnterprise = profile === 'enterprise';
	const base = isEnterprise ? QUANTUMIDE_INDEX_SCALE_ENTERPRISE : QUANTUMIDE_INDEX_SCALE_STANDARD;
	const maxFiles = typeof configuredMaxFiles === 'number' && configuredMaxFiles > 0
		? configuredMaxFiles
		: base.maxFiles;
	const maxFileChars = typeof configuredMaxFileChars === 'number' && configuredMaxFileChars > 0
		? configuredMaxFileChars
		: base.maxFileChars;
	return {
		maxFiles,
		maxFileChars,
		maxScanDepth: base.maxScanDepth,
		indexBatchSize: base.indexBatchSize,
		indexYieldMs: base.indexYieldMs,
		profile: isEnterprise ? 'enterprise' : 'standard',
	};
}
