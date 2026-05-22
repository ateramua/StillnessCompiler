/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { isReadOnlyOpenAIHostTool } from './agentVelocity.js';

export interface IQuantumIDEAgentToolInvocation {
	readonly id: string;
	readonly name: string;
	readonly args: Record<string, unknown>;
}

export interface IQuantumIDEAgentToolBatchResult {
	readonly id: string;
	readonly name: string;
	readonly result: string;
	readonly durationMs: number;
}

/** Req-03: partition tool calls into parallel read batches and serial mutating calls. */
export function partitionQuantumIDEAgentToolCalls(
	toolCalls: readonly IQuantumIDEAgentToolInvocation[],
): { readonly parallel: readonly IQuantumIDEAgentToolInvocation[]; readonly serial: readonly IQuantumIDEAgentToolInvocation[] } {
	const parallel: IQuantumIDEAgentToolInvocation[] = [];
	const serial: IQuantumIDEAgentToolInvocation[] = [];
	for (const call of toolCalls) {
		if (isReadOnlyOpenAIHostTool(call.name)) {
			parallel.push(call);
		} else {
			serial.push(call);
		}
	}
	return { parallel, serial };
}

export async function executeQuantumIDEAgentToolBatch<T extends IQuantumIDEAgentToolInvocation>(
	toolCalls: readonly T[],
	executor: (call: T) => Promise<string>,
	options?: { readonly parallel?: boolean; readonly onProgress?: (completed: number, total: number) => void },
): Promise<IQuantumIDEAgentToolBatchResult[]> {
	const total = toolCalls.length;
	if (total === 0) {
		return [];
	}
	const runOne = async (call: T): Promise<IQuantumIDEAgentToolBatchResult> => {
		const start = performance.now();
		const result = await executor(call);
		return { id: call.id, name: call.name, result, durationMs: performance.now() - start };
	};
	if (options?.parallel !== false && total > 1) {
		let completed = 0;
		const results = await Promise.all(toolCalls.map(async call => {
			const out = await runOne(call);
			completed++;
			options?.onProgress?.(completed, total);
			return out;
		}));
		return results;
	}
	const results: IQuantumIDEAgentToolBatchResult[] = [];
	for (let i = 0; i < toolCalls.length; i++) {
		results.push(await runOne(toolCalls[i]!));
		options?.onProgress?.(i + 1, total);
	}
	return results;
}
