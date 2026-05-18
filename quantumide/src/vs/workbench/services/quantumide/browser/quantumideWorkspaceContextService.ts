/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { basename, extname } from '../../../../base/common/path.js';
import { relativePath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { Range } from '../../../../editor/common/core/range.js';
import { MarkerSeverity } from '../../../../platform/markers/common/markers.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IFileService, type IFileStat } from '../../../../platform/files/common/files.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IMarkerService } from '../../../../platform/markers/common/markers.js';
import { QUANTUMIDE_AI_WORKSPACE_INDEX_STORAGE_KEY, QuantumIDEManifestKind, QuantumIDEWorkspaceIndexExcludeNames, createEmptyQuantumIDEWorkspaceGraph, detectQuantumIDEManifestKind, getQuantumIDEManifestEcosystem, summarizeQuantumIDEWorkspaceGraph, type IQuantumIDEFileNode, type IQuantumIDEManifestNode, type IQuantumIDEProjectNode, type IQuantumIDEWorkspaceFolderNode, type IQuantumIDEWorkspaceGraph } from '../../../../platform/quantumide/common/quantumideWorkspaceGraph.js';
import { QuantumIDEAISettingId } from '../../../../platform/quantumide/common/quantumideAISettings.js';
import { StorageScope, StorageTarget, IStorageService } from '../../../../platform/storage/common/storage.js';
import { IWorkspaceTrustManagementService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { IWorkspaceContextService, type IWorkspaceFolder } from '../../../../platform/workspace/common/workspace.js';
import { ISCMService } from '../../../contrib/scm/common/scm.js';
import { IQuantumIDEWorkspaceContextBuildOptions, IQuantumIDEWorkspaceContextService } from '../common/quantumideWorkspaceContext.js';

const MAX_SCAN_DEPTH = 6;
const MIN_INDEX_FILES = 100;
const MAX_INDEX_FILES = 1_000;
const MAX_CONTEXT_CHARS = 14_000;
const MAX_CONTEXT_FILES = 80;
const MAX_PROJECTS_IN_CONTEXT = 20;
const MAX_MANIFESTS_IN_CONTEXT = 40;
const MAX_DIAGNOSTICS_IN_CONTEXT = 12;
const MAX_SCM_RESOURCES_IN_CONTEXT = 30;

interface IQuantumIDEScanState {
	readonly workspaceFolder: IWorkspaceFolder;
	readonly rootRelativePrefix: string;
	readonly files: IQuantumIDEFileNode[];
	readonly manifests: IQuantumIDEManifestNode[];
	readonly projectsByRoot: Map<string, {
		readonly rootUri: string;
		readonly workspaceRelativePath: string;
		readonly manifestKinds: Set<QuantumIDEManifestKind>;
		readonly frameworks: Set<string>;
	}>;
	visited: number;
	truncated: boolean;
}

export class QuantumIDEWorkspaceContextService extends Disposable implements IQuantumIDEWorkspaceContextService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeGraph = this._register(new Emitter<IQuantumIDEWorkspaceGraph>());
	readonly onDidChangeGraph = this._onDidChangeGraph.event;

	private readonly _refreshScheduler = this._register(new RunOnceScheduler(() => {
		if (this._configurationService.getValue<boolean>(QuantumIDEAISettingId.IndexingEnabled) === true) {
			void this.refreshWorkspaceGraph('workspace change');
		}
	}, 1_500));

	private _graph: IQuantumIDEWorkspaceGraph | undefined;
	private _refreshPromise: Promise<IQuantumIDEWorkspaceGraph> | undefined;

	constructor(
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IFileService private readonly _fileService: IFileService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IStorageService private readonly _storageService: IStorageService,
		@IWorkspaceTrustManagementService private readonly _workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@ICodeEditorService private readonly _codeEditorService: ICodeEditorService,
		@IMarkerService private readonly _markerService: IMarkerService,
		@ISCMService private readonly _scmService: ISCMService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._graph = this._readStoredGraph();
		this._register(this._workspaceContextService.onDidChangeWorkspaceFolders(() => this._refreshScheduler.schedule()));
		this._register(this._fileService.onDidFilesChange(() => this._refreshScheduler.schedule()));
		this._register(this._workspaceTrustManagementService.onDidChangeTrust(() => this._refreshScheduler.schedule()));
		if (this._configurationService.getValue<boolean>(QuantumIDEAISettingId.IndexingEnabled) === true) {
			this._refreshScheduler.schedule(1_000);
		}
	}

	getWorkspaceGraph(): IQuantumIDEWorkspaceGraph | undefined {
		return this._graph;
	}

	async refreshWorkspaceGraph(reason = 'manual'): Promise<IQuantumIDEWorkspaceGraph> {
		if (this._refreshPromise) {
			return this._refreshPromise;
		}
		this._refreshPromise = this._doRefreshWorkspaceGraph(reason).finally(() => {
			this._refreshPromise = undefined;
		});
		return this._refreshPromise;
	}

	async buildWorkspaceContext(options: IQuantumIDEWorkspaceContextBuildOptions = {}): Promise<string> {
		const maxChars = options.maxChars ?? MAX_CONTEXT_CHARS;
		let graph = this._graph;
		if (!graph && this._configurationService.getValue<boolean>(QuantumIDEAISettingId.IndexingEnabled) === true) {
			graph = await this.refreshWorkspaceGraph('context build');
		}
		graph ??= createEmptyQuantumIDEWorkspaceGraph(this._workspaceContextService.getWorkspace().id, this._getWorkspaceFolders(), 'Workspace graph has not been built yet.');

		const sections: string[] = [
			'QuantumIDE workspace intelligence context',
			'Use this local, bounded workspace snapshot to answer project-structure questions. Do not assume files outside this snapshot were inspected.',
			'',
			'Workspace:',
			...this._formatWorkspaceGraph(graph),
		];

		if (options.includeActiveEditor !== false) {
			sections.push('', 'Active editor:', this._buildActiveEditorContext());
		}
		if (options.includeDiagnostics !== false) {
			sections.push('', 'Diagnostics:', this._buildDiagnosticsContext());
		}
		if (options.includeSCM !== false) {
			sections.push('', 'SCM changed resources:', this._buildSCMContext());
		}

		return this._clip(sections.join('\n'), maxChars);
	}

	private async _doRefreshWorkspaceGraph(reason: string): Promise<IQuantumIDEWorkspaceGraph> {
		const workspace = this._workspaceContextService.getWorkspace();
		const folders = this._getWorkspaceFolders();
		if (folders.length === 0) {
			const graph = createEmptyQuantumIDEWorkspaceGraph(workspace.id, folders, 'No workspace folder is open.');
			this._storeGraph(graph);
			return graph;
		}
		if (this._configurationService.getValue<boolean>(QuantumIDEAISettingId.IndexingEnabled) !== true) {
			const graph = createEmptyQuantumIDEWorkspaceGraph(workspace.id, folders, 'Workspace indexing is disabled.');
			this._storeGraph(graph);
			return graph;
		}
		if (!this._workspaceTrustManagementService.isWorkspaceTrusted()) {
			const graph = createEmptyQuantumIDEWorkspaceGraph(workspace.id, folders, 'Workspace is not trusted.');
			this._storeGraph(graph);
			return graph;
		}

		const maxFiles = this._getMaxIndexFiles();
		const files: IQuantumIDEFileNode[] = [];
		const manifests: IQuantumIDEManifestNode[] = [];
		const projectsByRoot = new Map<string, IQuantumIDEScanState['projectsByRoot'] extends Map<string, infer T> ? T : never>();
		const excludedNames = this._getExcludedIndexNames();
		let truncated = false;

		for (const folder of workspace.folders) {
			if (files.length >= maxFiles) {
				truncated = true;
				break;
			}
			const state: IQuantumIDEScanState = {
				workspaceFolder: folder,
				rootRelativePrefix: folder.name,
				files,
				manifests,
				projectsByRoot,
				visited: files.length,
				truncated: false,
			};
			await this._scanResource(folder.uri, state, 0, maxFiles, excludedNames);
			truncated = truncated || state.truncated;
		}

		const projects = this._createProjects(projectsByRoot);
		const graph: IQuantumIDEWorkspaceGraph = {
			version: 1,
			workspaceId: workspace.id,
			folders,
			projects,
			manifests,
			files,
			status: {
				indexed: true,
				generatedAt: new Date().toISOString(),
				reason,
				truncated,
				fileLimit: maxFiles,
			},
		};
		this._storeGraph(graph);
		this._logService.info(`[QuantumIDE] Workspace intelligence refreshed: ${summarizeQuantumIDEWorkspaceGraph(graph)}`);
		return graph;
	}

	private async _scanResource(resource: URI, state: IQuantumIDEScanState, depth: number, maxFiles: number, excludedNames: ReadonlySet<string>): Promise<void> {
		if (depth > MAX_SCAN_DEPTH || state.files.length >= maxFiles) {
			state.truncated = state.truncated || state.files.length >= maxFiles;
			return;
		}
		let stat: IFileStat;
		try {
			stat = await this._fileService.resolve(resource);
		} catch {
			return;
		}
		if (stat.isFile) {
			this._addFile(stat, state);
			return;
		}
		if (!stat.isDirectory || !stat.children) {
			return;
		}

		const children = [...stat.children].sort((left, right) => left.name.localeCompare(right.name));
		for (const child of children) {
			const manifestKind = detectQuantumIDEManifestKind(child.name);
			if (manifestKind) {
				this._addManifest(child, manifestKind, state);
			}
			if (excludedNames.has(child.name)) {
				continue;
			}
			if (state.files.length >= maxFiles) {
				state.truncated = true;
				return;
			}
			await this._scanResource(child.resource, state, depth + 1, maxFiles, excludedNames);
		}
	}

	private _addFile(stat: IFileStat, state: IQuantumIDEScanState): void {
		if (stat.name === '.env' || stat.name.endsWith('.pem') || stat.name.endsWith('.key')) {
			return;
		}
		const workspaceRelativePath = this._workspaceRelativePath(state.workspaceFolder, stat.resource);
		state.files.push({
			uri: stat.resource.toString(),
			workspaceRelativePath,
			name: stat.name,
			extension: extname(stat.name) || undefined,
		});
	}

	private _addManifest(stat: IFileStat, kind: QuantumIDEManifestKind, state: IQuantumIDEScanState): void {
		const projectUri = kind === QuantumIDEManifestKind.Git ? stat.resource : URI.joinPath(stat.resource, '..');
		const workspaceRelativePath = this._workspaceRelativePath(state.workspaceFolder, stat.resource);
		const projectPath = this._workspaceRelativePath(state.workspaceFolder, projectUri);
		state.manifests.push({
			kind,
			name: stat.name,
			uri: stat.resource.toString(),
			workspaceRelativePath,
			projectPath,
		});

		const projectKey = projectUri.toString();
		let project = state.projectsByRoot.get(projectKey);
		if (!project) {
			project = {
				rootUri: projectUri.toString(),
				workspaceRelativePath: projectPath,
				manifestKinds: new Set<QuantumIDEManifestKind>(),
				frameworks: new Set<string>(),
			};
			state.projectsByRoot.set(projectKey, project);
		}
		project.manifestKinds.add(kind);
		this._detectFrameworkHints(kind, stat).forEach(framework => project?.frameworks.add(framework));
	}

	private _detectFrameworkHints(kind: QuantumIDEManifestKind, stat: IFileStat): readonly string[] {
		if (kind === QuantumIDEManifestKind.PackageJson) {
			const path = stat.resource.path.toLowerCase();
			if (path.includes('/next') || path.includes('/app/')) {
				return ['node', 'typescript'];
			}
			return ['node'];
		}
		if (kind === QuantumIDEManifestKind.TsConfig) {
			return ['typescript'];
		}
		return [];
	}

	private _createProjects(projectsByRoot: IQuantumIDEScanState['projectsByRoot']): IQuantumIDEProjectNode[] {
		return [...projectsByRoot.values()]
			.map(project => {
				const manifestKinds = [...project.manifestKinds].sort((left, right) => left.localeCompare(right));
				const ecosystem = this._chooseProjectEcosystem(manifestKinds);
				return {
					id: project.rootUri,
					name: basename(URI.parse(project.rootUri).path) || project.workspaceRelativePath || 'workspace',
					rootUri: project.rootUri,
					workspaceRelativePath: project.workspaceRelativePath,
					ecosystem,
					manifestKinds,
					frameworks: [...project.frameworks].sort(),
				};
			})
			.sort((left, right) => left.workspaceRelativePath.localeCompare(right.workspaceRelativePath));
	}

	private _chooseProjectEcosystem(manifestKinds: readonly QuantumIDEManifestKind[]): string {
		const preferred = manifestKinds.find(kind => kind !== QuantumIDEManifestKind.Git && kind !== QuantumIDEManifestKind.TsConfig);
		return getQuantumIDEManifestEcosystem(preferred ?? manifestKinds[0] ?? QuantumIDEManifestKind.Git);
	}

	private _formatWorkspaceGraph(graph: IQuantumIDEWorkspaceGraph): string[] {
		const lines: string[] = [
			`Summary: ${summarizeQuantumIDEWorkspaceGraph(graph)}`,
			`Generated: ${graph.status.generatedAt ?? 'not generated'} (${graph.status.reason ?? 'unknown reason'})`,
			'Folders:',
			...(graph.folders.length ? graph.folders.map(folder => `- ${folder.name}: ${folder.uri}`) : ['- No workspace folders.']),
			'Projects:',
		];
		if (graph.projects.length === 0) {
			lines.push('- No project manifests detected yet.');
		} else {
			for (const project of graph.projects.slice(0, MAX_PROJECTS_IN_CONTEXT)) {
				lines.push(`- ${project.workspaceRelativePath || project.name} (${project.ecosystem}; manifests: ${project.manifestKinds.join(', ')}${project.frameworks.length ? `; frameworks: ${project.frameworks.join(', ')}` : ''})`);
			}
		}
		lines.push('Key manifests:');
		if (graph.manifests.length === 0) {
			lines.push('- None detected.');
		} else {
			for (const manifest of graph.manifests.slice(0, MAX_MANIFESTS_IN_CONTEXT)) {
				lines.push(`- ${manifest.workspaceRelativePath} (${manifest.kind})`);
			}
		}
		lines.push('Top indexed files:');
		for (const file of graph.files.slice(0, Math.min(this._getMaxContextFiles(), MAX_CONTEXT_FILES))) {
			lines.push(`- ${file.workspaceRelativePath}`);
		}
		if (graph.files.length > MAX_CONTEXT_FILES) {
			lines.push(`- ...${graph.files.length - MAX_CONTEXT_FILES} more indexed files omitted.`);
		}
		return lines;
	}

	private _buildActiveEditorContext(): string {
		const editor = this._codeEditorService.getActiveCodeEditor();
		const model = editor?.getModel();
		if (!editor || !model) {
			return '- No active text editor.';
		}
		const selection = editor.getSelection();
		const uri = model.uri.toString();
		if (!selection || selection.isEmpty()) {
			return `- ${uri}`;
		}
		const range = new Range(selection.startLineNumber, selection.startColumn, selection.endLineNumber, selection.endColumn);
		const selectedText = model.getValueInRange(range).slice(0, 2_000);
		return [`- ${uri}`, `Selection: ${selection.startLineNumber}:${selection.startColumn}-${selection.endLineNumber}:${selection.endColumn}`, selectedText ? this._indent(selectedText, '  ') : '  [empty selection]'].join('\n');
	}

	private _buildDiagnosticsContext(): string {
		const uri = this._codeEditorService.getActiveCodeEditor()?.getModel()?.uri;
		if (!uri) {
			return '- No active editor diagnostics are available.';
		}
		const markers = this._markerService.read({ resource: uri })
			.sort((left, right) => MarkerSeverity.compare(left.severity, right.severity))
			.slice(0, MAX_DIAGNOSTICS_IN_CONTEXT);
		if (markers.length === 0) {
			return '- No diagnostics reported for the active editor.';
		}
		return markers.map(marker => `- ${this._severityLabel(marker.severity)} ${marker.startLineNumber}:${marker.startColumn} ${marker.source ? `[${marker.source}] ` : ''}${marker.message}`).join('\n');
	}

	private _buildSCMContext(): string {
		const lines: string[] = [];
		let count = 0;
		for (const repository of this._scmService.repositories) {
			const root = repository.provider.rootUri?.toString() ?? repository.provider.label;
			lines.push(`Repository: ${root}`);
			for (const group of repository.provider.groups) {
				if (group.resources.length === 0) {
					continue;
				}
				lines.push(`  ${group.label}:`);
				for (const resource of group.resources) {
					if (count >= MAX_SCM_RESOURCES_IN_CONTEXT) {
						lines.push(`  - ...additional changed resources omitted after ${MAX_SCM_RESOURCES_IN_CONTEXT} entries.`);
						return lines.join('\n');
					}
					const status = resource.decorations.tooltip ?? resource.contextValue ?? 'changed';
					lines.push(`  - ${resource.sourceUri.toString()} (${status})`);
					count++;
				}
			}
		}
		return lines.length ? lines.join('\n') : '- No SCM changes detected.';
	}

	private _workspaceRelativePath(folder: IWorkspaceFolder, resource: URI): string {
		const relative = relativePath(folder.uri, resource) ?? '';
		return relative ? `${folder.name}/${relative}` : folder.name;
	}

	private _getWorkspaceFolders(): IQuantumIDEWorkspaceFolderNode[] {
		return this._workspaceContextService.getWorkspace().folders.map(folder => ({
			name: folder.name,
			uri: folder.uri.toString(),
		}));
	}

	private _getMaxIndexFiles(): number {
		const configured = this._configurationService.getValue<number>(QuantumIDEAISettingId.AgentMaxContextFiles) ?? 20;
		return Math.min(Math.max(configured * 10, MIN_INDEX_FILES), MAX_INDEX_FILES);
	}

	private _getMaxContextFiles(): number {
		const configured = this._configurationService.getValue<number>(QuantumIDEAISettingId.AgentMaxContextFiles) ?? 20;
		return Math.max(1, configured);
	}

	private _getExcludedIndexNames(): ReadonlySet<string> {
		const configured = this._configurationService.getValue<readonly string[]>(QuantumIDEAISettingId.IndexingExcludePatterns) ?? [];
		const names = new Set(QuantumIDEWorkspaceIndexExcludeNames);
		for (const item of configured) {
			const trimmed = typeof item === 'string' ? item.trim() : '';
			if (trimmed && !trimmed.includes('/') && !trimmed.includes('\\')) {
				names.add(trimmed);
			}
		}
		return names;
	}

	private _storeGraph(graph: IQuantumIDEWorkspaceGraph): void {
		this._graph = graph;
		this._storageService.store(QUANTUMIDE_AI_WORKSPACE_INDEX_STORAGE_KEY, JSON.stringify(graph), StorageScope.APPLICATION, StorageTarget.MACHINE);
		this._onDidChangeGraph.fire(graph);
	}

	private _readStoredGraph(): IQuantumIDEWorkspaceGraph | undefined {
		const raw = this._storageService.get(QUANTUMIDE_AI_WORKSPACE_INDEX_STORAGE_KEY, StorageScope.APPLICATION);
		if (!raw) {
			return undefined;
		}
		try {
			const parsed = JSON.parse(raw) as IQuantumIDEWorkspaceGraph;
			return parsed.version === 1 ? parsed : undefined;
		} catch {
			return undefined;
		}
	}

	private _severityLabel(severity: MarkerSeverity): string {
		switch (severity) {
			case MarkerSeverity.Error:
				return 'Error';
			case MarkerSeverity.Warning:
				return 'Warning';
			case MarkerSeverity.Info:
				return 'Info';
			case MarkerSeverity.Hint:
				return 'Hint';
		}
	}

	private _indent(value: string, prefix: string): string {
		return value.split(/\r?\n/).map(line => `${prefix}${line}`).join('\n');
	}

	private _clip(value: string, maxChars: number): string {
		if (value.length <= maxChars) {
			return value;
		}
		return `${value.slice(0, Math.max(0, maxChars - 80))}\n\n[QuantumIDE workspace context truncated to ${maxChars} characters.]`;
	}
}

registerSingleton(IQuantumIDEWorkspaceContextService, QuantumIDEWorkspaceContextService, InstantiationType.Delayed);
