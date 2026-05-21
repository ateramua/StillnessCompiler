/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import type { IQuantumIDEAstIndex, IQuantumIDESemanticIndex } from '../../../../platform/quantumide/common/quantumideSemanticIndex.js';
import type { IQuantumIDEDependencyGraph } from '../../../../platform/quantumide/common/quantumideDependencyGraph.js';
import type { IQuantumIDECommentsIndex, IQuantumIDEDiagnosticsIndex } from '../../../../platform/quantumide/common/quantumideIndexAugment.js';
import type { IQuantumIDEVectorIndex } from '../../../../platform/quantumide/common/quantumideVectorEmbeddings.js';

export interface IQuantumIDESemanticIndexService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeIndex: Event<void>;
	getSemanticIndex(): IQuantumIDESemanticIndex | undefined;
	getAstIndex(): IQuantumIDEAstIndex | undefined;
	getVectorIndex(): IQuantumIDEVectorIndex | undefined;
	getDependencyGraph(): IQuantumIDEDependencyGraph | undefined;
	getCommentsIndex(): IQuantumIDECommentsIndex | undefined;
	getDiagnosticsIndex(): IQuantumIDEDiagnosticsIndex | undefined;
	refreshIndexes(reason?: string): Promise<void>;
	searchSemantic(query: string, maxResults?: number): Promise<readonly { path: string; score: number }[]>;
	searchVector(query: string, maxResults?: number): Promise<readonly { path: string; score: number }[]>;
	searchComments(query: string, maxResults?: number): Promise<readonly { path: string; line: number; text: string; kind: string }[]>;
	searchDiagnostics(query: string, maxResults?: number): Promise<readonly { path: string; line: number; message: string; severity: string }[]>;
	inspectCache(): Promise<string>;
	clearIndexCache(): Promise<void>;
	getIndexStats(): { indexedFiles: number; vectorChunks: number };
}

export const IQuantumIDESemanticIndexService = createDecorator<IQuantumIDESemanticIndexService>('quantumIDESemanticIndexService');
