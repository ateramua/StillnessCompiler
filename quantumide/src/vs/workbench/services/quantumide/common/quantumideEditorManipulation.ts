/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { URI } from '../../../../base/common/uri.js';

export type QuantumIDEEditorManipulationAction =
	| 'set_cursor'
	| 'set_selection'
	| 'set_selections'
	| 'reveal_line'
	| 'reveal_line_center'
	| 'open_file'
	| 'add_cursor'
	| 'highlight_range'
	| 'close_editor';

export interface IQuantumIDEEditorManipulationRequest {
	readonly action: QuantumIDEEditorManipulationAction;
	readonly resource?: URI | string;
	readonly line?: number;
	readonly column?: number;
	readonly endLine?: number;
	readonly endColumn?: number;
	readonly selections?: readonly { startLine: number; startColumn: number; endLine: number; endColumn: number }[];
	readonly preserveFocus?: boolean;
}

export interface IQuantumIDEEditorManipulationResult {
	readonly success: boolean;
	readonly message: string;
	readonly resource?: string;
}

export interface IQuantumIDEEditorManipulationService {
	readonly _serviceBrand: undefined;
	manipulate(request: IQuantumIDEEditorManipulationRequest): Promise<IQuantumIDEEditorManipulationResult>;
}

export const IQuantumIDEEditorManipulationService = createDecorator<IQuantumIDEEditorManipulationService>('quantumIDEEditorManipulationService');
