/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';

export const QUANTUMIDE_ONBOARDING_STORAGE_KEY = 'quantumide.chat.onboarding.completed';

export interface IQuantumIDEOnboardingTip {
	readonly id: string;
	readonly title: string;
	readonly body: string;
}

const TIPS: readonly IQuantumIDEOnboardingTip[] = [
	{
		id: 'context',
		title: 'Automatic context',
		body: 'QuantumIDE injects open files, selection, diagnostics, and project manifests into every agent turn.',
	},
	{
		id: 'search',
		title: 'Search from chat',
		body: 'Ask the agent to search code with previews, symbols, comments, or documentation using built-in tools.',
	},
	{
		id: 'edit',
		title: 'Inline & multi-file edits',
		body: 'Use inline diff accept/reject in the editor, or multi-file diff review for larger changes.',
	},
	{
		id: 'tests',
		title: 'Tests & quality',
		body: 'Discover tests with discover_workspace_tests and run them via run_workspace_check (test, lint, compile).',
	},
	{
		id: 'plugins',
		title: 'Plugins',
		body: 'Extensions can register QuantumIDE plugins with custom tools and retrieval providers.',
	},
];

const WORKFLOW_TIPS: readonly IQuantumIDEOnboardingTip[] = [
	{ id: 'scaffold', title: 'Project scaffolding', body: 'Say "Create a Next.js project" or use Scaffold New Project. Files are staged for diff review before apply.' },
	{ id: 'repl', title: 'REPL execution', body: 'Click Run on code blocks or use run_repl_snippet. Sessions preserve history across runs.' },
	{ id: 'context', title: 'Auto context expansion', body: 'The agent calls expand_query_context to load related files without manual @ mentions.' },
	{ id: 'review', title: 'Code review', body: 'Use Review mode or analyze_code_review for severity-tagged findings before merging.' },
	{ id: 'framework', title: 'Framework workflows', body: 'Try "Add a React component Foo" or run_framework_workflow for idiomatic codegen.' },
	{ id: 'git', title: 'Git from chat', body: 'Stage, commit, branch, and push via run_git_operation (write ops need confirmation).' },
	{ id: 'deps', title: 'Dependencies', body: 'Install lodash, upgrade react, or audit via manage_dependency with confirm=true.' },
	{ id: 'rich-ui', title: 'Rich UI', body: 'Apply code blocks to editor, review pending edits, and jump to definitions from tool results.' },
];

export type QuantumIDEOnboardingContext = 'empty-workbench' | 'workspace-open' | 'pending-edits' | 'scm-dirty' | 'tests-failed' | 'first-chat';

export const QUANTUMIDE_TOUR_PROGRESS_KEY = 'quantumide.chat.tourProgress';

export interface IQuantumIDEOnboardingService {
	readonly _serviceBrand: undefined;
	hasCompletedOnboarding(): boolean;
	markOnboardingComplete(): void;
	getTips(): readonly IQuantumIDEOnboardingTip[];
	getWorkflowTips(): readonly IQuantumIDEOnboardingTip[];
	getContextualTips(context: QuantumIDEOnboardingContext): readonly IQuantumIDEOnboardingTip[];
	formatOnboardingMessage(): string;
	getTourStep(): number;
	setTourStep(step: number): void;
	skipTour(): void;
	hasSkippedTour(): boolean;
}

export const IQuantumIDEOnboardingService = createDecorator<IQuantumIDEOnboardingService>('quantumIDEOnboardingService');

export class QuantumIDEOnboardingService implements IQuantumIDEOnboardingService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IStorageService private readonly _storageService: IStorageService,
	) { }

	hasCompletedOnboarding(): boolean {
		return this._storageService.getBoolean(QUANTUMIDE_ONBOARDING_STORAGE_KEY, StorageScope.APPLICATION, false);
	}

	markOnboardingComplete(): void {
		this._storageService.store(QUANTUMIDE_ONBOARDING_STORAGE_KEY, true, StorageScope.APPLICATION, StorageTarget.USER);
	}

	getTips(): readonly IQuantumIDEOnboardingTip[] {
		return TIPS;
	}

	getWorkflowTips(): readonly IQuantumIDEOnboardingTip[] {
		return WORKFLOW_TIPS;
	}

	formatOnboardingMessage(): string {
		const lines = [
			'Welcome to QuantumIDE chat (Cursor parity). Quick start:',
			'',
			...TIPS.map(t => `**${t.title}** — ${t.body}`),
			'',
			'Commands: attach files (drag into chat), Start Collaboration Session, inline AI from the lightbulb menu.',
			'Settings: quantumide.chat.* and quantumide.ai.* in QuantumIDE settings.',
		];
		return lines.join('\n');
	}

	getContextualTips(context: QuantumIDEOnboardingContext): readonly IQuantumIDEOnboardingTip[] {
		switch (context) {
			case 'empty-workbench':
				return [
					{ id: 'open', title: 'Open a project', body: 'Use Open Folder or Clone Repository in Get started to unlock the full chat panel.' },
					...TIPS.slice(0, 2),
				];
			case 'workspace-open':
				return WORKFLOW_TIPS.slice(0, 4);
			case 'pending-edits':
				return [
					{ id: 'review', title: 'Review staged edits', body: 'Accept or reject pending chat edits in Inline Suggestions & Batch Edits before continuing.' },
				];
			case 'scm-dirty':
				return [
					{ id: 'scm', title: 'Commit your work', body: 'Use the Source Control section to stage, commit, and push from chat.' },
				];
			case 'tests-failed':
				return [
					{ id: 'tests', title: 'Fix failing tests', body: 'Click a failed test to jump to the line. Re-run from Tests & Lint Status.' },
				];
			case 'first-chat':
				return TIPS;
			default:
				return TIPS;
		}
	}

	getTourStep(): number {
		return this._storageService.getNumber(QUANTUMIDE_TOUR_PROGRESS_KEY, StorageScope.APPLICATION, 0);
	}

	setTourStep(step: number): void {
		this._storageService.store(QUANTUMIDE_TOUR_PROGRESS_KEY, step, StorageScope.APPLICATION, StorageTarget.USER);
	}

	skipTour(): void {
		this._storageService.store('quantumide.chat.tourSkipped', true, StorageScope.APPLICATION, StorageTarget.USER);
	}

	hasSkippedTour(): boolean {
		return this._storageService.getBoolean('quantumide.chat.tourSkipped', StorageScope.APPLICATION, false);
	}
}

registerSingleton(IQuantumIDEOnboardingService, QuantumIDEOnboardingService, InstantiationType.Delayed);
