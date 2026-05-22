/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

export function filterPathsByTargetDirectories(
	paths: readonly string[],
	targetDirectories: readonly string[] | undefined,
): readonly string[] {
	if (!targetDirectories?.length) {
		return paths;
	}
	const normalizedGlobs = targetDirectories.map(g => g.replace(/\\/g, '/').replace(/^\.\//, ''));
	return paths.filter(path => {
		const p = path.replace(/\\/g, '/');
		return normalizedGlobs.some(glob => {
			if (glob.endsWith('/')) {
				return p.startsWith(glob) || p.startsWith(`${glob}`);
			}
			return p === glob || p.startsWith(`${glob}/`) || p.includes(glob);
		});
	});
}
