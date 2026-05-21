/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ITestResultService } from '../../../contrib/testing/common/testResultService.js';
import { TestResultState } from '../../../contrib/testing/common/testTypes.js';
import type { ITestResult } from '../../../contrib/testing/common/testResult.js';
import {
	IQuantumIDEChatTestPanelService,
	IQuantumIDEChatTestResultItem,
	IQuantumIDEChatTestRunSummary,
	QuantumIDEChatTestState,
} from '../common/quantumideChatTestPanel.js';

function mapState(state: TestResultState): QuantumIDEChatTestState {
	switch (state) {
		case TestResultState.Passed: return 'passed';
		case TestResultState.Failed: return 'failed';
		case TestResultState.Skipped: return 'skipped';
		case TestResultState.Running: return 'running';
		case TestResultState.Queued: return 'queued';
		default: return 'queued';
	}
}

function collectTestItems(result: ITestResult, out: IQuantumIDEChatTestResultItem[]): void {
	for (const item of result.tests) {
		const task = item.tasks[item.tasks.length - 1];
		const message = task?.messages?.[0];
		const msgText = message && 'message' in message
			? (typeof message.message === 'string' ? message.message : String(message.message))
			: undefined;
		const location = message && 'location' in message ? message.location : undefined;
		out.push({
			id: item.item.extId,
			label: item.item.label,
			state: mapState(item.ownComputedState),
			message: msgText,
			uri: item.item.uri,
			line: location?.range?.startLineNumber,
			durationMs: task?.duration,
		});
	}
}

export class QuantumIDEChatTestPanelService extends Disposable implements IQuantumIDEChatTestPanelService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private _runs: IQuantumIDEChatTestRunSummary[] = [];
	private _filter = '';

	constructor(
		@ITestResultService private readonly _testResults: ITestResultService,
	) {
		super();
		this._register(this._testResults.onResultsChanged(() => this.refreshFromNativeResults()));
		this.refreshFromNativeResults();
	}

	getFilter(): string {
		return this._filter;
	}

	setFilter(query: string): void {
		this._filter = query;
		this._onDidChange.fire();
	}

	getLatestRun(): IQuantumIDEChatTestRunSummary | undefined {
		return this._runs[0];
	}

	getRuns(): readonly IQuantumIDEChatTestRunSummary[] {
		return this._runs;
	}

	refreshFromNativeResults(): void {
		const summaries: IQuantumIDEChatTestRunSummary[] = [];
		for (const result of this._testResults.results.slice(0, 8)) {
			const items: IQuantumIDEChatTestResultItem[] = [];
			collectTestItems(result, items);
			summaries.push({
				runId: result.id,
				passed: result.counts[TestResultState.Passed] ?? 0,
				failed: result.counts[TestResultState.Failed] ?? 0,
				skipped: result.counts[TestResultState.Skipped] ?? 0,
				running: (result.counts[TestResultState.Running] ?? 0) > 0,
				startedAt: result.completedAt ?? Date.now(),
				items,
			});
		}
		this._runs = summaries;
		this._onDidChange.fire();
	}
}

registerSingleton(IQuantumIDEChatTestPanelService, QuantumIDEChatTestPanelService, InstantiationType.Delayed);
