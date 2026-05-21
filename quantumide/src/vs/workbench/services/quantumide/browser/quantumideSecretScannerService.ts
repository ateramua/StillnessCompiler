/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { redactQuantumIDESecrets } from '../../../../platform/quantumide/common/quantumideSecretRedaction.js';
import {
	IQuantumIDESecretScanHit,
	IQuantumIDESecretScannerService,
	QUANTUMIDE_SECRET_SCAN_RULES,
} from '../common/quantumideSecretScanner.js';

const DEFAULT_MAX = 50;
const MAX_FILE_BYTES = 256_000;

export class QuantumIDESecretScannerService extends Disposable implements IQuantumIDESecretScannerService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IFileService private readonly _files: IFileService,
		@IWorkspaceContextService private readonly _workspace: IWorkspaceContextService,
	) {
		super();
	}

	async scanWorkspace(maxHits = DEFAULT_MAX): Promise<readonly IQuantumIDESecretScanHit[]> {
		const hits: IQuantumIDESecretScanHit[] = [];
		const folder = this._workspace.getWorkspace().folders[0];
		if (!folder) {
			return hits;
		}
		const skip = /\.(png|jpg|jpeg|gif|webp|ico|woff2?|ttf|eot|zip|gz|wasm|node|exe|dll|so|dylib)$/i;
		const scanDir = async (uri: URI): Promise<void> => {
			if (hits.length >= maxHits) {
				return;
			}
			let stat;
			try {
				stat = await this._files.resolve(uri, { resolveMetadata: true });
			} catch {
				return;
			}
			if (stat.isDirectory) {
				if (!stat.children) {
					return;
				}
				for (const child of stat.children) {
					if (child.name.startsWith('.git') || child.name === 'node_modules') {
						continue;
					}
					await scanDir(child.resource);
					if (hits.length >= maxHits) {
						return;
					}
				}
				return;
			}
			if (skip.test(stat.name)) {
				return;
			}
			if (typeof stat.size === 'number' && stat.size > MAX_FILE_BYTES) {
				return;
			}
			let text: string;
			try {
				text = (await this._files.readFile(uri)).value.toString();
			} catch {
				return;
			}
			const rel = uri.path.replace(folder.uri.path, '').replace(/^\//, '') || stat.name;
			const lines = text.split(/\r?\n/);
			for (let i = 0; i < lines.length && hits.length < maxHits; i++) {
				const line = lines[i];
				for (const { rule, pattern } of QUANTUMIDE_SECRET_SCAN_RULES) {
					if (pattern.test(line)) {
						hits.push({
							path: rel,
							line: i + 1,
							rule,
							snippet: redactQuantumIDESecrets(line).slice(0, 120),
						});
						break;
					}
				}
			}
		};
		await scanDir(folder.uri);
		return hits;
	}
}

registerSingleton(IQuantumIDESecretScannerService, QuantumIDESecretScannerService, InstantiationType.Delayed);
