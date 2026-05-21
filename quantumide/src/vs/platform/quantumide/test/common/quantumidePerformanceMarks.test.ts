/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import {
	getQuantumIDEPerformanceMarks,
	markQuantumIDEPerformanceEnd,
	markQuantumIDEPerformanceStart,
	QuantumIDEPerformanceMark,
	recordQuantumIDEPerformanceMark,
} from '../../common/quantumidePerformanceMarks.js';

suite('QuantumIDE performance marks', () => {
	test('records completed marks in shared store', () => {
		markQuantumIDEPerformanceStart(QuantumIDEPerformanceMark.InlineDiffRender);
		const duration = markQuantumIDEPerformanceEnd(QuantumIDEPerformanceMark.InlineDiffRender);
		assert.ok(duration !== undefined && duration >= 0);
		const marks = getQuantumIDEPerformanceMarks();
		assert.ok(marks.some(m => m.name === QuantumIDEPerformanceMark.InlineDiffRender));
	});

	test('supports direct duration recording', () => {
		recordQuantumIDEPerformanceMark(QuantumIDEPerformanceMark.SemanticSearch, 42);
		const marks = getQuantumIDEPerformanceMarks();
		assert.ok(marks.some(m => m.name === QuantumIDEPerformanceMark.SemanticSearch && m.durationMs === 42));
	});
});
