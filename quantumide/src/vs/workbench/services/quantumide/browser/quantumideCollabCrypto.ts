/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../base/common/buffer.js';
import { encodeBase64, decodeBase64 } from '../../../../base/common/buffer.js';

const ALGO = 'AES-GCM';

export async function deriveCollabCryptoKey(secretMaterial: string): Promise<CryptoKey> {
	const enc = new TextEncoder();
	const hash = await crypto.subtle.digest('SHA-256', enc.encode(secretMaterial));
	return crypto.subtle.importKey('raw', hash, { name: ALGO }, false, ['encrypt', 'decrypt']);
}

export async function encryptCollabPayload(plain: string, key: CryptoKey): Promise<string> {
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const enc = new TextEncoder();
	const cipher = await crypto.subtle.encrypt({ name: ALGO, iv }, key, enc.encode(plain));
	return JSON.stringify({
		v: 1,
		iv: encodeBase64(VSBuffer.wrap(iv)),
		data: encodeBase64(VSBuffer.wrap(new Uint8Array(cipher))),
	});
}

export async function decryptCollabPayload(payload: string, key: CryptoKey): Promise<string | undefined> {
	try {
		const parsed = JSON.parse(payload) as { v?: number; iv?: string; data?: string };
		if (parsed.v !== 1 || !parsed.iv || !parsed.data) {
			return payload;
		}
		const ivBuf = decodeBase64(parsed.iv);
		const dataBuf = decodeBase64(parsed.data);
		const dec = await crypto.subtle.decrypt(
			{ name: ALGO, iv: new Uint8Array(ivBuf.buffer) },
			key,
			new Uint8Array(dataBuf.buffer),
		);
		return new TextDecoder().decode(dec);
	} catch {
		try {
			JSON.parse(payload);
			return payload;
		} catch {
			return undefined;
		}
	}
}
