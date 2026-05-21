/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Public QuantumIDE plugin surface for extensions (§7).
 * Extensions call `registerQuantumIDEPlugin` to contribute host tools and external retrieval.
 */
export {
	registerQuantumIDEPlugin,
	getQuantumIDEPlugins,
	getQuantumIDEPluginClientTools,
	type IQuantumIDEPluginContribution,
	type IQuantumIDEPluginToolDefinition,
	type IQuantumIDEExternalRetrievalProvider,
} from './quantumidePluginRegistry.js';
