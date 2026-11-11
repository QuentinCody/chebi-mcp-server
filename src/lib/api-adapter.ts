// interlinked-tdd: exempt
import type { ApiFetchFn } from "@bio-mcp/shared/codemode/catalog";
import { chebiFetch } from "./http";
import { chebiCompleteness } from "./completeness";
import { readChebiResponse } from "./response";

/**
 * OLS4 search/select endpoints accept an `ontology` filter. We always pin
 * it to `chebi` if the caller did not already constrain it — this keeps
 * the server from leaking results from unrelated ontologies.
 */
const SCOPED_PATH_PREFIXES = ["/search", "/select", "/suggest"];
const CHEBI_ONTOLOGY = "chebi";

function withChebiScope(
	path: string,
	params: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
	const isScoped = SCOPED_PATH_PREFIXES.some((p) => path.startsWith(p));
	if (!isScoped) return params;
	const merged = { ...(params ?? {}) };
	if (!merged.ontology) merged.ontology = CHEBI_ONTOLOGY;
	return merged;
}

interface ChebiApiAdapterEnv {
	CHEBI_BASE_URL?: string;
}

export function createChebiApiFetch(env?: ChebiApiAdapterEnv): ApiFetchFn {
	return async (request) => {
		const native = request.path.startsWith("/native/");
		if (!(native ? ["GET", "POST"] : ["GET"]).includes(request.method) || (request.method === "GET" && request.body !== undefined)) {
			throw Object.assign(new Error("ChEBI supports native GET/POST reads and OLS GET without a body"), { status: 405 });
		}
		const path = native ? request.path.slice("/native".length) : request.path;
		const params = native ? request.params : withChebiScope(path, request.params);
		const result = await readChebiResponse(() => chebiFetch(path, params, {
			baseUrl: native ? "https://www.ebi.ac.uk/chebi/backend/api/public" : env?.CHEBI_BASE_URL,
			method: native ? request.method : "GET",
			body: native && request.body !== undefined ? JSON.stringify(request.body) : undefined,
			headers: native ? { Accept: "*/*", "Content-Type": "application/json" } : undefined,
			timeout: 30_000,
			deadlineMs: 30_000,
		}));
		const completeness = chebiCompleteness(result.data);
		return { ...result, ...(completeness ? { completeness } : {}) };
	};
}
