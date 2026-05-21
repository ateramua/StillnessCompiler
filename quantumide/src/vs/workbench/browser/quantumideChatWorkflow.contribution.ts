/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../nls.js';
import { Action2, registerAction2 } from '../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../platform/instantiation/common/instantiation.js';
import { INotificationService, Severity } from '../../platform/notification/common/notification.js';
import { IQuickInputService } from '../../platform/quickinput/common/quickInput.js';
import { isQuantumIDEProduct } from '../../platform/quantumide/common/quantumideChatPlatform.js';
import { QuantumIDEAICommandId } from '../../platform/quantumide/common/quantumideAISettings.js';
import { buildProjectScaffold, type QuantumIDEProjectScaffoldKind } from '../../platform/quantumide/common/quantumideProjectScaffold.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../common/contributions.js';
import product from '../../platform/product/common/product.js';
import { IQuantumIDEChatEditSessionService } from '../services/quantumide/browser/quantumideChatEditSessionService.js';
import { IQuantumIDEContextExpansionService } from '../services/quantumide/browser/quantumideContextExpansionService.js';
import { IQuantumIDEReplSessionService } from '../services/quantumide/browser/quantumideReplSessionService.js';
import { IQuantumIDEOnboardingService } from '../services/quantumide/browser/quantumideOnboardingService.js';
import { QuantumIDEChatWorkflowToolsContribution } from '../contrib/chat/browser/tools/quantumideChatWorkflowTools.js';

function isQuantumIDE(): boolean {
	return isQuantumIDEProduct(product.applicationName)
		|| [product.nameShort, product.nameLong].some(n => typeof n === 'string' && n.toLowerCase().includes('quantumide'));
}

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: QuantumIDEAICommandId.ScaffoldProject,
			title: localize2('quantumide.scaffoldProject', 'QuantumIDE: Scaffold New Project'),
			category: { value: localize('quantumide.ai.category', 'QuantumIDE AI'), original: 'QuantumIDE AI' },
			f1: true,
		});
	}
	override async run(accessor: ServicesAccessor): Promise<void> {
		const quickInput = accessor.get(IQuickInputService);
		const editSession = accessor.get(IQuantumIDEChatEditSessionService);
		const pick = await quickInput.pick([
			{ label: 'Next.js', kind: 'nextjs' as QuantumIDEProjectScaffoldKind },
			{ label: 'React + Vite', kind: 'react-vite' as QuantumIDEProjectScaffoldKind },
			{ label: 'Express + TypeScript', kind: 'express-ts' as QuantumIDEProjectScaffoldKind },
			{ label: 'Django', kind: 'django' as QuantumIDEProjectScaffoldKind },
			{ label: 'TypeScript library', kind: 'typescript-lib' as QuantumIDEProjectScaffoldKind },
			{ label: 'Add TypeScript', kind: 'add-typescript' as QuantumIDEProjectScaffoldKind },
		], { placeHolder: localize('quantumide.scaffold.pick', 'Choose project template') });
		if (!pick || !('kind' in pick)) { return; }
		const name = await quickInput.input({ title: localize('quantumide.scaffold.name', 'Project name'), value: 'my-app' });
		if (!name) { return; }
		const plan = buildProjectScaffold(pick.kind as QuantumIDEProjectScaffoldKind, name);
		await editSession.stageFromProposedEdits(plan.files.map(f => ({ path: f.path, content: f.content })), plan.title);
		accessor.get(INotificationService).info(localize('quantumide.scaffold.staged', 'Staged {0} files for review. Use Review Pending Chat Edits to accept.', plan.files.length));
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: QuantumIDEAICommandId.RunReplSnippet,
			title: localize2('quantumide.runRepl', 'QuantumIDE: Run REPL Snippet'),
			category: { value: localize('quantumide.ai.category', 'QuantumIDE AI'), original: 'QuantumIDE AI' },
			f1: true,
		});
	}
	override async run(accessor: ServicesAccessor): Promise<void> {
		const quickInput = accessor.get(IQuickInputService);
		const repl = accessor.get(IQuantumIDEReplSessionService);
		const code = await quickInput.input({ title: localize('quantumide.repl.code', 'Code to run'), placeHolder: 'console.log("hello")' });
		if (!code) { return; }
		const langPick = await quickInput.pick([
			{ label: 'javascript' }, { label: 'python' }, { label: 'shell' },
		], { placeHolder: 'Language' });
		const result = await repl.runInSession(langPick?.label ?? 'javascript', code);
		accessor.get(INotificationService).notify({ severity: Severity.Info, message: result.formatted.slice(0, 8000) });
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: QuantumIDEAICommandId.ExpandQueryContext,
			title: localize2('quantumide.expandContext', 'QuantumIDE: Expand Context for Query'),
			category: { value: localize('quantumide.ai.category', 'QuantumIDE AI'), original: 'QuantumIDE AI' },
			f1: true,
		});
	}
	override async run(accessor: ServicesAccessor): Promise<void> {
		const query = await accessor.get(IQuickInputService).input({ title: localize('quantumide.expand.query', 'What should the agent load?') });
		if (!query) { return; }
		const body = await accessor.get(IQuantumIDEContextExpansionService).expandForQuery(query);
		accessor.get(INotificationService).info(body.slice(0, 12000));
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: QuantumIDEAICommandId.StartWorkflowTour,
			title: localize2('quantumide.workflowTour', 'QuantumIDE: Start Chat Workflow Tour'),
			category: { value: localize('quantumide.ai.category', 'QuantumIDE AI'), original: 'QuantumIDE AI' },
			f1: true,
		});
	}
	override run(accessor: ServicesAccessor): void {
		const tips = accessor.get(IQuantumIDEOnboardingService).getWorkflowTips();
		let i = 0;
		const notifications = accessor.get(INotificationService);
		const show = () => {
			if (i >= tips.length) { return; }
			const tip = tips[i++];
			notifications.prompt(Severity.Info, `${tip.title} (${i}/${tips.length})\n\n${tip.body}`, [
				{ label: localize('quantumide.onboarding.next', 'Next'), run: () => show() },
				{ label: localize('quantumide.onboarding.done', 'Done'), run: () => { } },
			]);
		};
		show();
	}
});

if (isQuantumIDE()) {
	registerWorkbenchContribution2(QuantumIDEChatWorkflowToolsContribution.ID, QuantumIDEChatWorkflowToolsContribution, WorkbenchPhase.AfterRestored);
}
