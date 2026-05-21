/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../base/common/buffer.js';

const UTF16_LE_BOM = [0xFF, 0xFE];
const UTF16_BE_BOM = [0xFE, 0xFF];

export type QuantumIDEFileEncoding = 'utf8' | 'utf8bom' | 'utf16le' | 'utf16be';

export function detectQuantumIDEFileEncoding(buffer: VSBuffer): QuantumIDEFileEncoding {
	const bytes = buffer.buffer;
	if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
		return 'utf8bom';
	}
	if (bytes.length >= 2 && bytes[0] === UTF16_LE_BOM[0] && bytes[1] === UTF16_LE_BOM[1]) {
		return 'utf16le';
	}
	if (bytes.length >= 2 && bytes[0] === UTF16_BE_BOM[0] && bytes[1] === UTF16_BE_BOM[1]) {
		return 'utf16be';
	}
	return 'utf8';
}

export function decodeQuantumIDEFileBuffer(buffer: VSBuffer): { text: string; encoding: QuantumIDEFileEncoding } {
	const encoding = detectQuantumIDEFileEncoding(buffer);
	switch (encoding) {
		case 'utf8bom':
			return { text: buffer.toString().replace(/^\uFEFF/, ''), encoding };
		case 'utf16le':
			return { text: new TextDecoder('utf-16le').decode(buffer.buffer.subarray(2)), encoding };
		case 'utf16be': {
			const le = swapUtf16Endian(buffer.buffer.subarray(2));
			return { text: new TextDecoder('utf-16le').decode(le), encoding };
		}
		default:
			return { text: buffer.toString(), encoding };
	}
}

export function encodeQuantumIDEFileText(text: string, encoding: QuantumIDEFileEncoding): VSBuffer {
	switch (encoding) {
		case 'utf8bom':
			return VSBuffer.fromString('\uFEFF' + text);
		case 'utf16le': {
			const body = encodeUtf16Le(text);
			return VSBuffer.wrap(Uint8Array.from([...UTF16_LE_BOM, ...body]));
		}
		case 'utf16be': {
			const body = swapUtf16Endian(encodeUtf16Le(text));
			return VSBuffer.wrap(Uint8Array.from([...UTF16_BE_BOM, ...body]));
		}
		default:
			return VSBuffer.fromString(text);
	}
}

function encodeUtf16Le(text: string): Uint8Array {
	const out = new Uint8Array(text.length * 2);
	for (let i = 0; i < text.length; i++) {
		const code = text.charCodeAt(i);
		out[i * 2] = code & 0xff;
		out[i * 2 + 1] = code >> 8;
	}
	return out;
}

function swapUtf16Endian(bytes: Uint8Array): Uint8Array {
	const out = new Uint8Array(bytes.length);
	for (let i = 0; i + 1 < bytes.length; i += 2) {
		out[i] = bytes[i + 1];
		out[i + 1] = bytes[i];
	}
	if (bytes.length % 2 === 1) {
		out[bytes.length - 1] = bytes[bytes.length - 1];
	}
	return out;
}
