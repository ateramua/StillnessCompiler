/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

export type QuantumIDEFrameworkKind = 'react' | 'nextjs' | 'express' | 'django' | 'flask' | 'unknown';

export type QuantumIDEFrameworkWorkflowAction =
	| 'add_react_component'
	| 'add_next_api_route'
	| 'add_django_model'
	| 'add_express_route';

export interface IQuantumIDEFrameworkWorkflowEdit {
	readonly path: string;
	readonly content: string;
	readonly operation: 'create' | 'write' | 'append';
}

export interface IQuantumIDEFrameworkWorkflowResult {
	readonly framework: QuantumIDEFrameworkKind;
	readonly action: QuantumIDEFrameworkWorkflowAction;
	readonly summary: string;
	readonly edits: readonly IQuantumIDEFrameworkWorkflowEdit[];
}

export function detectFrameworkFromManifests(manifestPaths: readonly string[]): QuantumIDEFrameworkKind {
	const joined = manifestPaths.join(' ').toLowerCase();
	if (joined.includes('next.config')) {
		return 'nextjs';
	}
	if (joined.includes('django') || joined.includes('manage.py')) {
		return 'django';
	}
	if (joined.includes('flask')) {
		return 'flask';
	}
	if (joined.includes('express')) {
		return 'express';
	}
	if (joined.includes('react') || joined.includes('vite.config')) {
		return 'react';
	}
	return 'unknown';
}

export function runFrameworkWorkflow(
	action: QuantumIDEFrameworkWorkflowAction,
	args: { name: string; route?: string; fields?: Record<string, string> },
): IQuantumIDEFrameworkWorkflowResult {
	switch (action) {
		case 'add_react_component':
			return addReactComponent(args.name);
		case 'add_next_api_route':
			return addNextApiRoute(args.route ?? args.name);
		case 'add_django_model':
			return addDjangoModel(args.name, args.fields ?? {});
		case 'add_express_route':
			return addExpressRoute(args.route ?? `/${args.name}`);
		default:
			return addReactComponent(args.name);
	}
}

function addReactComponent(name: string): IQuantumIDEFrameworkWorkflowResult {
	const file = `src/components/${name}.tsx`;
	return {
		framework: 'react',
		action: 'add_react_component',
		summary: `Create React component ${name}`,
		edits: [{
			path: file,
			operation: 'create',
			content: `interface ${name}Props {\n  children?: React.ReactNode;\n}\n\nexport function ${name}({ children }: ${name}Props) {\n  return <section className="${name.toLowerCase()}">{children ?? '${name}'}</section>;\n}\n\nexport default ${name};\n`,
		}],
	};
}

function addNextApiRoute(route: string): IQuantumIDEFrameworkWorkflowResult {
	const slug = route.replace(/^\//, '').replace(/\//g, '-');
	const file = `src/app/api/${slug}/route.ts`;
	return {
		framework: 'nextjs',
		action: 'add_next_api_route',
		summary: `Create Next.js API route ${route}`,
		edits: [{
			path: file,
			operation: 'create',
			content: `import { NextResponse } from 'next/server';\n\nexport async function GET() {\n  return NextResponse.json({ route: '${route}', ok: true });\n}\n`,
		}],
	};
}

function addDjangoModel(name: string, fields: Record<string, string>): IQuantumIDEFrameworkWorkflowResult {
	const model = name.replace(/[^a-zA-Z0-9_]/g, '');
	const fieldLines = Object.entries(fields).map(([k, t]) => `    ${k} = models.${t || 'CharField'}(max_length=255)`).join('\n');
	return {
		framework: 'django',
		action: 'add_django_model',
		summary: `Add Django model ${model}`,
		edits: [{
			path: 'models.py',
			operation: 'append',
			content: `\n\nclass ${model}(models.Model):\n${fieldLines || '    name = models.CharField(max_length=255)'}\n\n    def __str__(self):\n        return str(self.name)\n`,
		}],
	};
}

function addExpressRoute(route: string): IQuantumIDEFrameworkWorkflowResult {
	return {
		framework: 'express',
		action: 'add_express_route',
		summary: `Add Express route ${route}`,
		edits: [{
			path: 'src/routes.ts',
			operation: 'append',
			content: `\n\nrouter.get('${route}', (_req, res) => res.json({ route: '${route}' }));\n`,
		}],
	};
}

export function formatFrameworkWorkflowResult(result: IQuantumIDEFrameworkWorkflowResult): string {
	const edits = result.edits.map(e => `- [${e.operation}] ${e.path}`).join('\n');
	return [`Framework: ${result.framework}`, `Action: ${result.action}`, result.summary, '', 'Edits:', edits].join('\n');
}
