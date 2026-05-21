/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { joinPath } from '../../../../base/common/resources.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import {
	expandContextFromSymbols,
	formatContextExpansion,
} from '../../../../platform/quantumide/common/quantumideContextExpansion.js';
import { QUANTUMIDE_AST_INDEX_FILE, parseAstIndexJson } from '../../../../platform/quantumide/common/quantumideSemanticIndex.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IQuantumIDESemanticIndexService } from '../common/quantumideSemanticIndex.js';

export interface IQuantumIDEContextExpansionService {
	readonly _serviceBrand: undefined;
	expandForQuery(query: string, maxHits?: number): Promise<string>;
	buildAutomaticExpansionSection(userMessage: string): Promise<string | undefined>;
}

export const IQuantumIDEContextExpansionService = createDecorator<IQuantumIDEContextExpansionService>('quantumIDEContextExpansionService');

export class QuantumIDEContextExpansionService implements IQuantumIDEContextExpansionService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IFileService private readonly _fileService: IFileService,
		@IWorkspaceContextService private readonly _workspace: IWorkspaceContextService,
		@IQuantumIDESemanticIndexService private readonly _semanticIndex: IQuantumIDESemanticIndexService,
	) { }

	async expandForQuery(query: string, maxHits = 10): Promise<string> {
		const folder = this._workspace.getWorkspace().folders[0];
		if (!folder) {
			return 'No workspace open.';
		}
		const ast = this._semanticIndex.getAstIndex();
		const symbols = ast?.symbols.map(s => ({ path: s.path, name: s.name, kind: s.kind, line: s.line })) ?? [];
		const fileContents = new Map<string, string>();
		const terms = query.toLowerCase().split(/\W+/).filter(t => t.length > 2);
		const paths = [...new Set(symbols.filter(s => terms.some(t => s.name.toLowerCase().includes(t) || s.path.toLowerCase().includes(t))).map(s => s.path))].slice(0, maxHits);
		for (const path of paths) {
			try {
				fileContents.set(path, (await this._fileService.readFile(joinPath(folder.uri, path))).value.toString());
			} catch {
				// skip
			}
		}
		if (symbols.length === 0) {
			try {
				const raw = (await this._fileService.readFile(joinPath(folder.uri, QUANTUMIDE_AST_INDEX_FILE))).value.toString();
				const index = parseAstIndexJson(raw);
				if (index) {
					for (const s of index.symbols) {
						symbols.push({ path: s.path, name: s.name, kind: s.kind, line: s.line });
					}
				}
			} catch {
				// no index
			}
		}
		return formatContextExpansion(expandContextFromSymbols(query, symbols, fileContents, maxHits));
	}

	async buildAutomaticExpansionSection(userMessage: string): Promise<string | undefined> {
		const trimmed = userMessage.trim();
		if (trimmed.length < 8) {
			return undefined;
		}
		const questionLike = /\?|how|what|where|why|explain|fix|implement|add|create|refactor/i.test(trimmed);
		if (!questionLike) {
			return undefined;
		}
		const body = await this.expandForQuery(trimmed, 6);
		if (body.startsWith('No related context')) {
			return undefined;
		}
		return body.slice(0, 4000);
	}
}

registerSingleton(IQuantumIDEContextExpansionService, QuantumIDEContextExpansionService, InstantiationType.Delayed);
