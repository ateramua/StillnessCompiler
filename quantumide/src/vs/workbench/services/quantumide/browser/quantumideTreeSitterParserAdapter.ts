/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import type { Parser, Query } from '@vscode/tree-sitter-wasm';
import { extractAstSymbolsFromText, type IQuantumIDEAstSymbolEntry } from '../../../../platform/quantumide/common/quantumideAstSymbols.js';
import {
	QuantumIDERegexParserAdapter,
	setDefaultQuantumIDEParserAdapter,
	type IQuantumIDEParserAdapter,
} from '../../../../platform/quantumide/common/quantumideTechStackAdapters.js';
import { ITreeSitterLibraryService } from '../../../../editor/common/services/treeSitter/treeSitterLibraryService.js';
import { ILogService } from '../../../../platform/log/common/log.js';

const SYMBOL_QUERY = `
(function_declaration name: (identifier) @name)
(class_declaration name: (type_identifier) @name)
(interface_declaration name: (type_identifier) @name)
(type_alias_declaration name: (type_identifier) @name)
(method_definition name: (property_identifier) @name)
(function_definition name: (identifier) @name)
(class_definition name: (identifier) @name)
`;

const LANG_MAP: Record<string, string> = {
	ts: 'typescript',
	tsx: 'typescript',
	js: 'javascript',
	jsx: 'javascript',
	py: 'python',
	go: 'go',
	rs: 'rust',
	java: 'java',
	cs: 'csharp',
};

export class QuantumIDETreeSitterParserAdapter implements IQuantumIDEParserAdapter {
	readonly id = 'tree-sitter-wasm';

	private _parser: Parser | undefined;
	private readonly _queryByLanguage = new Map<string, Query>();

	constructor(
		private readonly _treeSitterLibraryService: ITreeSitterLibraryService,
		private readonly _logService: ILogService,
	) { }

	extractSymbols(path: string, text: string, maxPerFile = 80): readonly IQuantumIDEAstSymbolEntry[] {
		const languageId = this._languageIdFromPath(path);
		if (!languageId || !this._parser || !this._treeSitterLibraryService.supportsLanguage(languageId, undefined)) {
			return extractAstSymbolsFromText(path, text, maxPerFile);
		}
		const language = this._treeSitterLibraryService.getLanguage(languageId, true, undefined);
		const query = language ? this._queryByLanguage.get(languageId) : undefined;
		if (!language || !query) {
			return extractAstSymbolsFromText(path, text, maxPerFile);
		}
		try {
			this._parser.setLanguage(language);
			const tree = this._parser.parse(text);
			if (!tree) {
				return extractAstSymbolsFromText(path, text, maxPerFile);
			}
			try {
				const symbols: IQuantumIDEAstSymbolEntry[] = [];
				for (const capture of query.captures(tree.rootNode)) {
					if (symbols.length >= maxPerFile) {
						break;
					}
					const name = capture.node.text;
					if (!name) {
						continue;
					}
					const parentType = capture.node.parent?.type ?? '';
					const kind = parentType.includes('class') ? 'class'
						: parentType.includes('interface') ? 'interface'
							: parentType.includes('method') ? 'method'
								: 'function';
					symbols.push({
						path,
						line: capture.node.startPosition.row + 1,
						kind,
						name,
					});
				}
				return symbols.length > 0 ? symbols : extractAstSymbolsFromText(path, text, maxPerFile);
			} finally {
				tree.delete();
			}
		} catch (err) {
			this._logService.trace('[QuantumIDE] Tree-sitter symbol extraction failed, using regex fallback', err);
			return extractAstSymbolsFromText(path, text, maxPerFile);
		}
	}

	async initialize(): Promise<void> {
		try {
			const ParserClass = await this._treeSitterLibraryService.getParserClass();
			this._parser = new ParserClass();
			for (const languageId of ['typescript', 'javascript', 'python']) {
				if (!this._treeSitterLibraryService.supportsLanguage(languageId, undefined)) {
					continue;
				}
				const language = await this._treeSitterLibraryService.getLanguagePromise(languageId);
				if (!language) {
					continue;
				}
				const query = await this._treeSitterLibraryService.createQuery(language, SYMBOL_QUERY);
				this._queryByLanguage.set(languageId, query);
			}
		} catch (err) {
			this._logService.warn('[QuantumIDE] Tree-sitter parser init failed', err);
		}
	}

	private _languageIdFromPath(path: string): string | undefined {
		const ext = path.split('.').pop()?.toLowerCase();
		return ext ? LANG_MAP[ext] : undefined;
	}
}

export function registerQuantumIDETreeSitterParserAdapter(
	treeSitterLibraryService: ITreeSitterLibraryService,
	logService: ILogService,
): QuantumIDETreeSitterParserAdapter {
	const adapter = new QuantumIDETreeSitterParserAdapter(treeSitterLibraryService, logService);
	void adapter.initialize().then(() => setDefaultQuantumIDEParserAdapter(adapter));
	return adapter;
}

export function restoreQuantumIDERegexParserAdapter(): void {
	setDefaultQuantumIDEParserAdapter(new QuantumIDERegexParserAdapter());
}
