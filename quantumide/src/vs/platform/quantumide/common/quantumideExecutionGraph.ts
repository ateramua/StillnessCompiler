/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

export const QUANTUMIDE_EXECUTION_GRAPH_FILE = '.quantumide/execution-graph.json';

export type QuantumIDEExecutionNodeStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

export interface IQuantumIDEExecutionNode {
	readonly id: string;
	readonly title: string;
	readonly dependsOn: readonly string[];
	status: QuantumIDEExecutionNodeStatus;
	readonly notes?: string;
}

export interface IQuantumIDEExecutionGraph {
	readonly version: 1;
	readonly generatedAt: string;
	readonly goal: string;
	readonly nodes: IQuantumIDEExecutionNode[];
}

export function createExecutionGraph(goal: string, steps: readonly { title: string; dependsOn?: readonly string[] }[]): IQuantumIDEExecutionGraph {
	const nodes: IQuantumIDEExecutionNode[] = steps.map((step, index) => ({
		id: `step-${index + 1}`,
		title: step.title,
		dependsOn: step.dependsOn ?? (index > 0 ? [`step-${index}`] : []),
		status: 'pending',
	}));
	return {
		version: 1,
		generatedAt: new Date().toISOString(),
		goal,
		nodes,
	};
}

export function parseExecutionGraphJson(raw: string): IQuantumIDEExecutionGraph | undefined {
	try {
		const parsed = JSON.parse(raw) as IQuantumIDEExecutionGraph;
		return parsed?.version === 1 && Array.isArray(parsed.nodes) ? parsed : undefined;
	} catch {
		return undefined;
	}
}

export function formatExecutionGraphForPrompt(graph: IQuantumIDEExecutionGraph): string {
	const lines = [
		`Execution graph goal: ${graph.goal}`,
		'Nodes:',
		...graph.nodes.map(n => `- [${n.status}] ${n.id}: ${n.title}${n.dependsOn.length ? ` (depends: ${n.dependsOn.join(', ')})` : ''}`),
	];
	return lines.join('\n');
}

export function getNextRunnableNodes(graph: IQuantumIDEExecutionGraph): IQuantumIDEExecutionNode[] {
	const done = new Set(graph.nodes.filter(n => n.status === 'done' || n.status === 'skipped').map(n => n.id));
	return graph.nodes.filter(n => n.status === 'pending' && n.dependsOn.every(dep => done.has(dep)));
}

export function markExecutionNodeRunning(graph: IQuantumIDEExecutionGraph, toolName: string, args: Record<string, unknown>): IQuantumIDEExecutionGraph {
	const nodeId = inferExecutionNodeForTool(graph, toolName, args);
	if (!nodeId) {
		return graph;
	}
	return markExecutionNode(graph, nodeId, 'running');
}

export function markExecutionNode(graph: IQuantumIDEExecutionGraph, nodeId: string, status: QuantumIDEExecutionNodeStatus): IQuantumIDEExecutionGraph {
	return {
		...graph,
		nodes: graph.nodes.map(n => n.id === nodeId ? { ...n, status } : n),
	};
}

export function isExecutionGraphComplete(graph: IQuantumIDEExecutionGraph): boolean {
	return graph.nodes.every(n => n.status === 'done' || n.status === 'skipped');
}

/** Parse planning checklist from assistant text into an execution graph. */
export function serializeExecutionGraph(graph: IQuantumIDEExecutionGraph): string {
	return JSON.stringify(graph, undefined, 2);
}

/** Map host tool activity to the best-matching pending execution node. */
export function inferExecutionNodeForTool(graph: IQuantumIDEExecutionGraph, toolName: string, args: Record<string, unknown>): string | undefined {
	const runnable = getNextRunnableNodes(graph);
	if (runnable.length === 0) {
		return graph.nodes.find(n => n.status === 'pending')?.id;
	}
	const path = typeof args.path === 'string' ? args.path.toLowerCase() : '';
	const label = `${toolName} ${path}`.toLowerCase();
	for (const node of runnable) {
		const title = node.title.toLowerCase();
		if (path && title.includes(path.split('/').pop() ?? path)) {
			return node.id;
		}
		if (title.includes('test') && (toolName.includes('test') || toolName === 'run_workspace_check')) {
			return node.id;
		}
		if (title.includes('lint') && toolName === 'run_workspace_check') {
			return node.id;
		}
		if (title.includes('search') && toolName.includes('search')) {
			return node.id;
		}
		if (title.includes('index') && toolName.includes('index')) {
			return node.id;
		}
		if (label.length > 3 && title.split(/\s+/).some(word => label.includes(word) && word.length > 3)) {
			return node.id;
		}
	}
	return runnable[0]?.id;
}

export function applyToolResultToExecutionGraph(
	graph: IQuantumIDEExecutionGraph,
	toolName: string,
	args: Record<string, unknown>,
	success: boolean,
): IQuantumIDEExecutionGraph {
	const nodeId = inferExecutionNodeForTool(graph, toolName, args);
	if (!nodeId) {
		return graph;
	}
	return markExecutionNode(graph, nodeId, success ? 'done' : 'failed');
}

export function executionGraphFromPlanningText(goal: string, text: string): IQuantumIDEExecutionGraph | undefined {
	const lines = text.split(/\r?\n/);
	const steps: { title: string }[] = [];
	for (const line of lines) {
		const match = line.match(/^\s*[-*]\s*\[[ xX]?\]\s+(.+)$/);
		if (match?.[1]) {
			steps.push({ title: match[1].trim() });
		}
	}
	if (steps.length === 0) {
		return undefined;
	}
	return createExecutionGraph(goal, steps);
}
