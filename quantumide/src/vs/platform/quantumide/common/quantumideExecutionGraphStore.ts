/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../base/common/buffer.js';
import { joinPath } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import type { IFileService } from '../../files/common/files.js';
import {
	QUANTUMIDE_EXECUTION_GRAPH_FILE,
	applyToolResultToExecutionGraph,
	parseExecutionGraphJson,
	serializeExecutionGraph,
	type IQuantumIDEExecutionGraph,
} from './quantumideExecutionGraph.js';

export async function loadQuantumIDEExecutionGraph(
	fileService: IFileService,
	workspaceRoot: URI | undefined,
): Promise<IQuantumIDEExecutionGraph | undefined> {
	if (!workspaceRoot) {
		return undefined;
	}
	try {
		const raw = (await fileService.readFile(joinPath(workspaceRoot, QUANTUMIDE_EXECUTION_GRAPH_FILE))).value.toString();
		return parseExecutionGraphJson(raw);
	} catch {
		return undefined;
	}
}

export async function saveQuantumIDEExecutionGraph(
	fileService: IFileService,
	workspaceRoot: URI | undefined,
	graph: IQuantumIDEExecutionGraph,
): Promise<void> {
	if (!workspaceRoot) {
		return;
	}
	await fileService.createFolder(joinPath(workspaceRoot, '.quantumide'));
	await fileService.writeFile(
		joinPath(workspaceRoot, QUANTUMIDE_EXECUTION_GRAPH_FILE),
		VSBuffer.fromString(serializeExecutionGraph(graph)),
	);
}

export async function updateQuantumIDEExecutionGraphForTool(
	fileService: IFileService,
	workspaceRoot: URI | undefined,
	current: IQuantumIDEExecutionGraph | undefined,
	toolName: string,
	args: Record<string, unknown>,
	success: boolean,
): Promise<IQuantumIDEExecutionGraph | undefined> {
	if (!current) {
		return undefined;
	}
	const updated = applyToolResultToExecutionGraph(current, toolName, args, success);
	await saveQuantumIDEExecutionGraph(fileService, workspaceRoot, updated);
	return updated;
}
