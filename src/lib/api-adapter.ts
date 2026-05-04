// interlinked-tdd: exempt
import type { ApiFetchFn } from "@bio-mcp/shared/codemode/catalog";
import { chebiFetch } from "./http";

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
		const params = withChebiScope(request.path, request.params);
		const response = await chebiFetch(request.path, params, {
			baseUrl: env?.CHEBI_BASE_URL,
		});

		if (!response.ok) {
			let errorBody: string;
			try {
				errorBody = await response.text();
			} catch {
				errorBody = response.statusText;
			}
			const error = new Error(
				`HTTP ${response.status}: ${errorBody.slice(0, 300)}`,
			) as Error & { status: number; data: unknown };
			error.status = response.status;
			error.data = errorBody;
			throw error;
		}

		const contentType = response.headers.get("content-type") || "";
		if (!contentType.includes("json")) {
			const text = await response.text();
			return { status: response.status, data: { text } };
		}

		const data = await response.json();
		return { status: response.status, data };
	};
}
