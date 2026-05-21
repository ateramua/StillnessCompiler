/*---------------------------------------------------------------------------------------------
 *  Optional @lancedb/lancedb types for agent-host vector search (package is optionalDependency).
 *--------------------------------------------------------------------------------------------*/

declare module '@lancedb/lancedb' {
	export interface LanceTable {
		vectorSearch(vector: number[]): {
			limit(n: number): { toArray(): Promise<Array<{ path: string; _distance?: number }>> };
		};
	}

	export interface LanceConnection {
		tableNames(): Promise<string[]>;
		dropTable(name: string): Promise<void>;
		createTable(name: string, data: unknown[]): Promise<unknown>;
		openTable(name: string): Promise<LanceTable>;
	}

	export function connect(uri: string): Promise<LanceConnection>;
}
