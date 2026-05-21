/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../base/common/lifecycle.js';
import { localize, localize2 } from '../../nls.js';
import { Action2, registerAction2 } from '../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../platform/configuration/common/configuration.js';
import { ServicesAccessor } from '../../platform/instantiation/common/instantiation.js';
import { QuantumIDEAICommandId, QuantumIDEAISettingId } from '../../platform/quantumide/common/quantumideAISettings.js';
import {
	QuantumIDEPerformanceBudgetMs,
	setQuantumIDEPerformanceBudgetEnforcement,
} from '../../platform/quantumide/common/quantumidePerformanceBudgets.js';
import {
	formatQuantumIDEPerformanceMarkLabel,
	getQuantumIDEPerformanceBudgetKeyForMark,
	getQuantumIDEPerformanceMarks,
} from '../../platform/quantumide/common/quantumidePerformanceMarks.js';
import { INotificationService } from '../../platform/notification/common/notification.js';
import { IWorkbenchContribution } from '../common/contributions.js';
import { WorkbenchPhase, registerWorkbenchContribution2 } from '../common/contributions.js';
import { IQuantumIDEChatContextOrchestrator } from '../services/quantumide/common/quantumideChatContext.js';
import { IQuantumIDESemanticIndexService } from '../services/quantumide/common/quantumideSemanticIndex.js';

class QuantumIDEPerformanceContribution extends Disposable implements IWorkbenchContribution {
	constructor(
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super();
		const apply = () => {
			setQuantumIDEPerformanceBudgetEnforcement(configurationService.getValue<boolean>(QuantumIDEAISettingId.PerformanceEnforceBudgets) === true);
		};
		apply();
		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(QuantumIDEAISettingId.PerformanceEnforceBudgets)) {
				apply();
			}
		}));
	}
}

registerWorkbenchContribution2(
	'quantumide.performanceContribution',
	QuantumIDEPerformanceContribution,
	WorkbenchPhase.AfterRestored,
);

async function collectQuantumIDEPerformanceSamples(accessor: ServicesAccessor): Promise<void> {
	const orchestrator = accessor.get(IQuantumIDEChatContextOrchestrator);
	const index = accessor.get(IQuantumIDESemanticIndexService);
	await orchestrator.buildChatContext({
		includeOpenTabs: false,
		includeTerminal: false,
		includeBranch: false,
		includeNavigationHistory: false,
		includeActiveEditor: true,
		includeDiagnostics: false,
		includeSCM: false,
		maxChars: 4000,
	});
	await index.searchSemantic('workspace', 3);
}

function formatPerformanceReportBody(marks: ReturnType<typeof getQuantumIDEPerformanceMarks>, sampled: boolean): string {
	const budgets = QuantumIDEPerformanceBudgetMs;
	const lines = [
		localize('quantumide.performance.report', 'QuantumIDE performance (§6 targets):'),
		`chatStartup: target ${budgets.chatStartup}ms`,
		`inlineCompletion: target ${budgets.inlineCompletion}ms`,
		`semanticRetrieval: target ${budgets.semanticRetrieval}ms`,
		`diffRendering: target ${budgets.diffRendering}ms`,
		`incrementalIndexing: target ${budgets.incrementalIndexing}ms`,
		`multiFileApply: target ${budgets.multiFileApply}ms`,
		'',
		localize('quantumide.performance.recentMarks', 'Recent marks:'),
	];
	if (marks.length === 0) {
		lines.push(localize('quantumide.performance.noMarks', '(none recorded yet)'));
	} else {
		for (const mark of marks.slice(-12)) {
			const label = formatQuantumIDEPerformanceMarkLabel(mark.name);
			const budgetKey = getQuantumIDEPerformanceBudgetKeyForMark(mark.name) as keyof typeof QuantumIDEPerformanceBudgetMs | undefined;
			const target = budgetKey ? budgets[budgetKey] : undefined;
			const targetSuffix = target !== undefined ? ` / target ${target}ms` : '';
			const status = target !== undefined && mark.durationMs > target ? ' ⚠' : '';
			lines.push(`- ${label}: ${mark.durationMs.toFixed(1)}ms${targetSuffix}${status}`);
		}
	}
	if (sampled) {
		lines.push('', localize('quantumide.performance.sampled', '(samples collected just now — use chat or reindex for live data)'));
	}
	lines.push('', localize('quantumide.performance.hint', 'Tip: marks update when you send chat messages, reindex, apply inline diffs, or run agent edits.'));
	return lines.join('\n');
}

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: QuantumIDEAICommandId.ShowPerformanceReport,
			title: localize2('quantumide.performance.showReport', 'QuantumIDE: Show Performance Report'),
			category: { value: localize('quantumide.ai.category', 'QuantumIDE AI'), original: 'QuantumIDE AI' },
			f1: true,
		});
	}
	override async run(accessor: ServicesAccessor): Promise<void> {
		const notificationService = accessor.get(INotificationService);
		let marks = getQuantumIDEPerformanceMarks();
		let sampled = false;
		if (marks.length === 0) {
			try {
				await collectQuantumIDEPerformanceSamples(accessor);
				sampled = true;
				marks = getQuantumIDEPerformanceMarks();
			} catch (error) {
				notificationService.warn(localize(
					'quantumide.performance.sampleFailed',
					'Could not collect performance samples: {0}',
					error instanceof Error ? error.message : String(error),
				));
			}
		}
		notificationService.info(formatPerformanceReportBody(marks, sampled));
	}
});
