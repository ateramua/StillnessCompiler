/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import {
	classifyQuantumIDEAgentIntent,
	resolveQuantumIDEAgentPipeline,
	resolveQuantumIDEAgentPipelineForTurn,
} from '../../common/quantumideAgentIntentClassifier.js';
import {
	getQuantumIDEAgentPipelineTelemetry,
	QuantumIDEAgentPipelineTelemetryKey,
	recordQuantumIDEAgentPipeline,
	resetQuantumIDEAgentPipelineTelemetryForTests,
} from '../../common/quantumideAgentPipelineTelemetry.js';

suite('quantumideAgentIntentClassifier', () => {
	teardown(() => {
		resetQuantumIDEAgentPipelineTelemetryForTests();
	});

	test('AC-03-01: "does file X exist" classifies as fs_simple → lite pipeline', () => {
		const classification = classifyQuantumIDEAgentIntent('Does package.json exist in this repo?');
		assert.strictEqual(classification.intent, 'fs_simple');
		assert.strictEqual(classification.pipeline, 'lite');
		const pipeline = resolveQuantumIDEAgentPipeline(classification, 'auto');
		assert.strictEqual(pipeline, 'lite');
		recordQuantumIDEAgentPipeline(pipeline);
		assert.deepStrictEqual(getQuantumIDEAgentPipelineTelemetry(), {
			[QuantumIDEAgentPipelineTelemetryKey]: 'lite',
		});
	});

	test('pipelineMode lite forces lite regardless of message', () => {
		const { pipeline } = resolveQuantumIDEAgentPipelineForTurn('Refactor the auth module', 'lite');
		assert.strictEqual(pipeline, 'lite');
	});

	test('AC-03-03: @codebase uses full pipeline', () => {
		const classification = classifyQuantumIDEAgentIntent('@codebase where is the main entry point?');
		assert.strictEqual(classification.intent, 'full');
		assert.strictEqual(classification.pipeline, 'full');
		const { pipeline } = resolveQuantumIDEAgentPipelineForTurn('@codebase find auth flow', 'lite');
		assert.strictEqual(pipeline, 'full');
		recordQuantumIDEAgentPipeline(pipeline);
		assert.deepStrictEqual(getQuantumIDEAgentPipelineTelemetry(), {
			[QuantumIDEAgentPipelineTelemetryKey]: 'full',
		});
	});

	test('AC-03-03: quantumide.codebase attachment forces full pipeline', () => {
		const { pipeline, classification } = resolveQuantumIDEAgentPipelineForTurn('find the auth module', 'lite', undefined, {
			hasCodebaseAttachment: true,
		});
		assert.strictEqual(pipeline, 'full');
		assert.strictEqual(classification.intent, 'full');
	});
});
