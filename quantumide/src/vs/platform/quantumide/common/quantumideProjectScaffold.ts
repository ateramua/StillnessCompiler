/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

export type QuantumIDEProjectScaffoldKind =
	| 'nextjs'
	| 'react-vite'
	| 'express-ts'
	| 'django'
	| 'typescript-lib'
	| 'add-typescript';

export interface IQuantumIDEProjectScaffoldFile {
	readonly path: string;
	readonly content: string;
}

export interface IQuantumIDEProjectScaffoldPlan {
	readonly kind: QuantumIDEProjectScaffoldKind;
	readonly title: string;
	readonly description: string;
	readonly files: readonly IQuantumIDEProjectScaffoldFile[];
	readonly postInstallCommands: readonly string[];
}

export function buildProjectScaffold(kind: QuantumIDEProjectScaffoldKind, projectName = 'my-app'): IQuantumIDEProjectScaffoldPlan {
	switch (kind) {
		case 'nextjs':
			return buildNextJsScaffold(projectName);
		case 'react-vite':
			return buildReactViteScaffold(projectName);
		case 'express-ts':
			return buildExpressTsScaffold(projectName);
		case 'django':
			return buildDjangoScaffold(projectName);
		case 'typescript-lib':
			return buildTypescriptLibScaffold(projectName);
		case 'add-typescript':
			return buildAddTypescriptScaffold();
		default:
			return buildReactViteScaffold(projectName);
	}
}

export function detectScaffoldKindFromPrompt(prompt: string): QuantumIDEProjectScaffoldKind | undefined {
	const p = prompt.toLowerCase();
	if (/next\.?js|next js/.test(p)) {
		return 'nextjs';
	}
	if (/react.*vite|vite.*react/.test(p)) {
		return 'react-vite';
	}
	if (/express/.test(p)) {
		return 'express-ts';
	}
	if (/django/.test(p)) {
		return 'django';
	}
	if (/typescript|tsconfig/.test(p) && /add|enable|support/.test(p)) {
		return 'add-typescript';
	}
	if (/typescript.*lib|ts library/.test(p)) {
		return 'typescript-lib';
	}
	return undefined;
}

function buildNextJsScaffold(name: string): IQuantumIDEProjectScaffoldPlan {
	return {
		kind: 'nextjs',
		title: `Next.js app: ${name}`,
		description: 'App Router Next.js project with TypeScript.',
		postInstallCommands: ['npm install'],
		files: [
			{
				path: 'package.json',
				content: JSON.stringify({
					name,
					version: '0.1.0',
					private: true,
					scripts: { dev: 'next dev', build: 'next build', start: 'next start', lint: 'next lint' },
					dependencies: { next: '^15.0.0', react: '^19.0.0', 'react-dom': '^19.0.0' },
					devDependencies: { typescript: '^5.6.0', '@types/node': '^22.0.0', '@types/react': '^19.0.0', '@types/react-dom': '^19.0.0', eslint: '^9.0.0', 'eslint-config-next': '^15.0.0' },
				}, undefined, 2),
			},
			{
				path: 'tsconfig.json',
				content: JSON.stringify({
					compilerOptions: {
						target: 'ES2017', lib: ['dom', 'dom.iterable', 'esnext'], allowJs: true, skipLibCheck: true,
						strict: true, noEmit: true, esModuleInterop: true, module: 'esnext', moduleResolution: 'bundler',
						resolveJsonModule: true, isolatedModules: true, jsx: 'preserve', incremental: true,
						plugins: [{ name: 'next' }], paths: { '@/*': ['./src/*'] },
					},
					include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
					exclude: ['node_modules'],
				}, undefined, 2),
			},
			{
				path: 'next.config.ts',
				content: `import type { NextConfig } from 'next';\n\nconst config: NextConfig = {};\n\nexport default config;\n`,
			},
			{
				path: 'src/app/layout.tsx',
				content: `export default function RootLayout({ children }: { children: React.ReactNode }) {\n  return (\n    <html lang="en">\n      <body>{children}</body>\n    </html>\n  );\n}\n`,
			},
			{
				path: 'src/app/page.tsx',
				content: `export default function Home() {\n  return <main><h1>${name}</h1><p>Welcome to your Next.js app.</p></main>;\n}\n`,
			},
			{ path: '.gitignore', content: 'node_modules\n.next\nout\n.env*.local\n' },
		],
	};
}

function buildReactViteScaffold(name: string): IQuantumIDEProjectScaffoldPlan {
	return {
		kind: 'react-vite',
		title: `React + Vite app: ${name}`,
		description: 'React 19 + Vite + TypeScript starter.',
		postInstallCommands: ['npm install'],
		files: [
			{
				path: 'package.json',
				content: JSON.stringify({
					name,
					private: true,
					version: '0.0.0',
					type: 'module',
					scripts: { dev: 'vite', build: 'tsc -b && vite build', preview: 'vite preview' },
					dependencies: { react: '^19.0.0', 'react-dom': '^19.0.0' },
					devDependencies: { '@types/react': '^19.0.0', '@types/react-dom': '^19.0.0', '@vitejs/plugin-react': '^4.3.0', typescript: '^5.6.0', vite: '^6.0.0' },
				}, undefined, 2),
			},
			{
				path: 'index.html',
				content: `<!doctype html>\n<html lang="en">\n  <head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${name}</title></head>\n  <body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body>\n</html>\n`,
			},
			{
				path: 'src/main.tsx',
				content: `import { StrictMode } from 'react';\nimport { createRoot } from 'react-dom/client';\nimport App from './App';\n\ncreateRoot(document.getElementById('root')!).render(\n  <StrictMode><App /></StrictMode>,\n);\n`,
			},
			{
				path: 'src/App.tsx',
				content: `export default function App() {\n  return <h1>${name}</h1>;\n}\n`,
			},
			{
				path: 'vite.config.ts',
				content: `import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\n\nexport default defineConfig({ plugins: [react()] });\n`,
			},
			{
				path: 'tsconfig.json',
				content: JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', jsx: 'react-jsx', strict: true, moduleResolution: 'bundler', skipLibCheck: true }, include: ['src'] }, undefined, 2),
			},
			{ path: '.gitignore', content: 'node_modules\ndist\n' },
		],
	};
}

function buildExpressTsScaffold(name: string): IQuantumIDEProjectScaffoldPlan {
	return {
		kind: 'express-ts',
		title: `Express + TypeScript API: ${name}`,
		description: 'Minimal Express server with TypeScript.',
		postInstallCommands: ['npm install'],
		files: [
			{
				path: 'package.json',
				content: JSON.stringify({
					name,
					version: '1.0.0',
					scripts: { dev: 'tsx watch src/index.ts', build: 'tsc', start: 'node dist/index.js' },
					dependencies: { express: '^4.21.0' },
					devDependencies: { typescript: '^5.6.0', tsx: '^4.19.0', '@types/express': '^5.0.0', '@types/node': '^22.0.0' },
				}, undefined, 2),
			},
			{
				path: 'tsconfig.json',
				content: JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'CommonJS', outDir: 'dist', rootDir: 'src', strict: true, esModuleInterop: true }, include: ['src'] }, undefined, 2),
			},
			{
				path: 'src/index.ts',
				content: `import express from 'express';\n\nconst app = express();\napp.use(express.json());\n\napp.get('/health', (_req, res) => res.json({ ok: true }));\n\nconst port = process.env.PORT ?? 3000;\napp.listen(port, () => console.log(\`Listening on \${port}\`));\n`,
			},
			{ path: '.gitignore', content: 'node_modules\ndist\n' },
		],
	};
}

function buildDjangoScaffold(name: string): IQuantumIDEProjectScaffoldPlan {
	const module = name.replace(/-/g, '_');
	return {
		kind: 'django',
		title: `Django project: ${name}`,
		description: 'Minimal Django project scaffold (run django-admin after apply).',
		postInstallCommands: [`python3 -m pip install django`, `django-admin startproject ${module} .`],
		files: [
			{ path: 'requirements.txt', content: 'django>=5.0\n' },
			{ path: 'manage.py', content: `#!/usr/bin/env python\nimport os\nimport sys\n\nif __name__ == '__main__':\n    os.environ.setdefault('DJANGO_SETTINGS_MODULE', '${module}.settings')\n    from django.core.management import execute_from_command_line\n    execute_from_command_line(sys.argv)\n` },
			{ path: '.gitignore', content: '__pycache__\n*.pyc\n.env\nvenv/\n' },
		],
	};
}

function buildTypescriptLibScaffold(name: string): IQuantumIDEProjectScaffoldPlan {
	return {
		kind: 'typescript-lib',
		title: `TypeScript library: ${name}`,
		description: 'Publishable TS library scaffold.',
		postInstallCommands: ['npm install'],
		files: [
			{
				path: 'package.json',
				content: JSON.stringify({
					name,
					version: '0.1.0',
					main: 'dist/index.js',
					types: 'dist/index.d.ts',
					scripts: { build: 'tsc', test: 'node --test' },
					devDependencies: { typescript: '^5.6.0' },
				}, undefined, 2),
			},
			{
				path: 'tsconfig.json',
				content: JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'CommonJS', declaration: true, outDir: 'dist', rootDir: 'src', strict: true }, include: ['src'] }, undefined, 2),
			},
			{ path: 'src/index.ts', content: `export function hello(name: string): string {\n  return \`Hello, \${name}\`;\n}\n` },
		],
	};
}

function buildAddTypescriptScaffold(): IQuantumIDEProjectScaffoldPlan {
	return {
		kind: 'add-typescript',
		title: 'Add TypeScript support',
		description: 'Adds tsconfig.json and devDependency entries to package.json.',
		postInstallCommands: ['npm install'],
		files: [
			{
				path: 'tsconfig.json',
				content: JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', strict: true, skipLibCheck: true, moduleResolution: 'bundler' }, include: ['src', '**/*.ts', '**/*.tsx'] }, undefined, 2),
			},
		],
	};
}

export function formatScaffoldPlan(plan: IQuantumIDEProjectScaffoldPlan): string {
	const fileList = plan.files.map(f => `- ${f.path} (${f.content.length} chars)`).join('\n');
	const cmds = plan.postInstallCommands.map(c => `- \`${c}\``).join('\n');
	return [
		`# ${plan.title}`,
		plan.description,
		'',
		`Files (${plan.files.length}):`,
		fileList,
		'',
		'Post-apply commands (require confirmation):',
		cmds || '- (none)',
	].join('\n');
}
