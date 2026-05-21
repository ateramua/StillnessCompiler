/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

const QUANTUMIDE_CACHE_PREFIX = 'QIDE1:';

/** Obfuscates index cache payloads at rest when encryption is enabled (§5.2). */
export function encryptQuantumIDEIndexPayload(plainText: string, workspaceKey: string): string {
	const key = deriveWorkspaceKey(workspaceKey);
	const bytes = new TextEncoder().encode(plainText);
	const out = new Uint8Array(bytes.length);
	for (let i = 0; i < bytes.length; i++) {
		out[i] = bytes[i] ^ key[i % key.length];
	}
	return QUANTUMIDE_CACHE_PREFIX + uint8ToBase64(out);
}

export function decryptQuantumIDEIndexPayload(payload: string, workspaceKey: string): string {
	if (!payload.startsWith(QUANTUMIDE_CACHE_PREFIX)) {
		return payload;
	}
	const key = deriveWorkspaceKey(workspaceKey);
	const raw = base64ToUint8(payload.slice(QUANTUMIDE_CACHE_PREFIX.length));
	const out = new Uint8Array(raw.length);
	for (let i = 0; i < raw.length; i++) {
		out[i] = raw[i] ^ key[i % key.length];
	}
	return new TextDecoder().decode(out);
}

export function isEncryptedQuantumIDEIndexPayload(payload: string): boolean {
	return payload.startsWith(QUANTUMIDE_CACHE_PREFIX);
}

function deriveWorkspaceKey(workspaceKey: string): Uint8Array {
	const bytes = new TextEncoder().encode(workspaceKey || 'quantumide-default');
	const out = new Uint8Array(32);
	for (let i = 0; i < out.length; i++) {
		out[i] = bytes[i % bytes.length] ^ (i * 31);
	}
	return out;
}

function uint8ToBase64(bytes: Uint8Array): string {
	if (typeof Buffer !== 'undefined') {
		return Buffer.from(bytes).toString('base64');
	}
	let binary = '';
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return globalThis.btoa(binary);
}

function base64ToUint8(base64: string): Uint8Array {
	if (typeof Buffer !== 'undefined') {
		return new Uint8Array(Buffer.from(base64, 'base64'));
	}
	const binary = globalThis.atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}
