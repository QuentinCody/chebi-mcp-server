// interlinked-tdd: exempt
import type { McpServer } from "@bio-mcp/shared/mcp";
import { createSearchTool } from "@bio-mcp/shared/codemode/search-tool";
import { createExecuteTool } from "@bio-mcp/shared/codemode/execute-tool";
import { chebiCatalog } from "../spec/catalog";
import { chebiResponse } from "../lib/tool-result";
import { createChebiApiFetch } from "../lib/api-adapter";

interface CodeModeEnv {
	CHEBI_DATA_DO: DurableObjectNamespace;
	CODE_MODE_LOADER: WorkerLoader;
	CHEBI_BASE_URL?: string;
}

export function registerCodeMode(server: McpServer, env: CodeModeEnv): void {
	const apiFetch = createChebiApiFetch({ CHEBI_BASE_URL: env.CHEBI_BASE_URL });

	const register = server.tool.bind(server) as (...args: unknown[]) => void;
	const dualRegistrar = { tool: (...args: unknown[]) => {
		const [name, ...rest] = args;
		const handler = rest.pop() as (args: unknown, extra: unknown) => Promise<any>;
		for (const alias of [String(name), `mcp_${String(name)}`]) register(alias, ...rest,
			(args: unknown, extra: unknown) => chebiResponse(() => handler(args, extra), env, alias, extra, args));
	} };
	const searchTool = createSearchTool({
		prefix: "chebi",
		catalog: chebiCatalog,
	});
	searchTool.register(dualRegistrar);

	const executeTool = createExecuteTool({
		prefix: "chebi",
		// Verifiable provenance: chebi_execute results carry a _meta.citation.
		source: { id: "chebi", name: "ChEBI", url: "https://www.ebi.ac.uk/chebi", license: "CC BY 4.0" },
		catalog: chebiCatalog,
		apiFetch,
		maxInlineBytes: 30 * 1024,
		stagingThreshold: 30 * 1024,
		preserveApiErrors: true,
		timeout: 45_000,
		doNamespace: env.CHEBI_DATA_DO,
		loader: env.CODE_MODE_LOADER,
	});
	executeTool.register(dualRegistrar);
}
