// interlinked-tdd: exempt
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createSearchTool } from "@bio-mcp/shared/codemode/search-tool";
import { createExecuteTool } from "@bio-mcp/shared/codemode/execute-tool";
import { chebiCatalog } from "../spec/catalog";
import { createChebiApiFetch } from "../lib/api-adapter";

interface CodeModeEnv {
	CHEBI_DATA_DO: DurableObjectNamespace;
	CODE_MODE_LOADER: WorkerLoader;
	CHEBI_BASE_URL?: string;
}

export function registerCodeMode(server: McpServer, env: CodeModeEnv): void {
	const apiFetch = createChebiApiFetch({ CHEBI_BASE_URL: env.CHEBI_BASE_URL });

	const searchTool = createSearchTool({
		prefix: "chebi",
		catalog: chebiCatalog,
	});
	searchTool.register(server as unknown as { tool: (...args: unknown[]) => void });

	const executeTool = createExecuteTool({
		prefix: "chebi",
		// Verifiable provenance: chebi_execute results carry a _meta.citation.
		source: { id: "chebi", name: "ChEBI", url: "https://www.ebi.ac.uk/chebi", license: "CC BY 4.0" },
		catalog: chebiCatalog,
		apiFetch,
		doNamespace: env.CHEBI_DATA_DO,
		loader: env.CODE_MODE_LOADER,
	});
	executeTool.register(server as unknown as { tool: (...args: unknown[]) => void });
}
