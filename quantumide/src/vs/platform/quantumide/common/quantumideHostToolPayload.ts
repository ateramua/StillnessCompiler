/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/** FR-02-06 / AC-02-04: max serialized host tool response size (bytes). */
export const QUANTUMIDE_HOST_TOOL_PAYLOAD_MAX_BYTES = 512 * 1024;

export const QUANTUMIDE_HOST_TOOL_PAYLOAD_META_MARKER = '__QIDE_TOOL_PAYLOAD_META__';

export interface IQuantumIDEHostToolPayloadMeta {
	readonly truncated: boolean;
	readonly originalBytes: number;
	readonly maxBytes: number;
	readonly tool?: string;
}

export interface IQuantumIDEHostToolPayloadTruncateResult extends IQuantumIDEHostToolPayloadMeta {
	readonly text: string;
}

export function utf8ByteLength(text: string): number {
	return new TextEncoder().encode(text).length;
}

/** Truncate UTF-8 string to at most `maxBytes` without splitting a code point. */
export function sliceUtf8StringToByteBudget(text: string, maxBytes: number): string {
	const bytes = new TextEncoder().encode(text);
	if (bytes.length <= maxBytes) {
		return text;
	}
	let end = maxBytes;
	while (end > 0 && (bytes[end]! & 0xc0) === 0x80) {
		end--;
	}
	return new TextDecoder().decode(bytes.subarray(0, end));
}

export function buildQuantumIDEHostToolPayloadMeta(meta: IQuantumIDEHostToolPayloadMeta): string {
	return `${QUANTUMIDE_HOST_TOOL_PAYLOAD_META_MARKER}${JSON.stringify(meta)}`;
}

export function parseQuantumIDEHostToolPayloadMeta(text: string): IQuantumIDEHostToolPayloadMeta | undefined {
	const idx = text.indexOf(QUANTUMIDE_HOST_TOOL_PAYLOAD_META_MARKER);
	if (idx < 0) {
		return undefined;
	}
	const afterMarker = text.slice(idx + QUANTUMIDE_HOST_TOOL_PAYLOAD_META_MARKER.length);
	const lineEnd = afterMarker.indexOf('\n');
	const jsonPayload = lineEnd >= 0 ? afterMarker.slice(0, lineEnd) : afterMarker;
	try {
		const parsed = JSON.parse(jsonPayload) as IQuantumIDEHostToolPayloadMeta;
		if (typeof parsed.truncated !== 'boolean' || typeof parsed.originalBytes !== 'number' || typeof parsed.maxBytes !== 'number') {
			return undefined;
		}
		return parsed;
	} catch {
		return undefined;
	}
}

/**
 * Caps host tool text payloads at {@link QUANTUMIDE_HOST_TOOL_PAYLOAD_MAX_BYTES} with explicit truncation metadata.
 * Never throws — agent rounds continue with truncated preview + flag (AC-02-04).
 */
export function truncateQuantumIDEHostToolPayload(
	payload: string,
	toolName?: string,
	maxBytes: number = QUANTUMIDE_HOST_TOOL_PAYLOAD_MAX_BYTES,
): IQuantumIDEHostToolPayloadTruncateResult {
	const originalBytes = utf8ByteLength(payload);
	if (originalBytes <= maxBytes) {
		return { text: payload, truncated: false, originalBytes, maxBytes, tool: toolName };
	}
	const meta: IQuantumIDEHostToolPayloadMeta = {
		truncated: true,
		originalBytes,
		maxBytes,
		tool: toolName,
	};
	const metaLine = buildQuantumIDEHostToolPayloadMeta(meta) + '\n';
	const metaBytes = utf8ByteLength(metaLine);
	const bodyBudget = Math.max(0, maxBytes - metaBytes);
	const body = sliceUtf8StringToByteBudget(payload, bodyBudget);
	const text = metaLine + body;
	return { text, truncated: true, originalBytes, maxBytes, tool: toolName };
}

/** Apply FR-02-06 cap to a host tool return string. */
export function applyQuantumIDEHostToolPayloadCap(payload: string, toolName?: string): string {
	return truncateQuantumIDEHostToolPayload(payload, toolName).text;
}
