// interlinked-tdd: exempt
import { restFetch } from "@bio-mcp/shared/http/rest-fetch";
import type { RestFetchOptions } from "@bio-mcp/shared/http/rest-fetch";

const OLS4_BASE = "https://www.ebi.ac.uk/ols4/api";
const RETRY_STATUSES = [429, 500, 502, 503] as const;
const DEFAULT_RETRIES = 3;
const DEFAULT_TIMEOUT_MS = 30_000;

export interface ChebiFetchOptions extends Omit<RestFetchOptions, "retryOn"> {
	baseUrl?: string;
}

/**
 * Fetch from EBI OLS4 with the ChEBI ontology pre-scoped.
 *
 * OLS4 is the EBI's unified ontology API — used for many ontologies — but
 * this server scopes every catalog path to ChEBI specifically. The host
 * adapter pre-scopes search/term operations to `?ontology=chebi` when not
 * already specified in the catalog path.
 */
export async function chebiFetch(
	path: string,
	params?: Record<string, unknown>,
	opts?: ChebiFetchOptions,
): Promise<Response> {
	const baseUrl = opts?.baseUrl ?? OLS4_BASE;
	const headers: Record<string, string> = {
		Accept: "application/json",
		...(opts?.headers ?? {}),
	};
	return restFetch(baseUrl, path, params, {
		...opts,
		headers,
		retryOn: [...RETRY_STATUSES],
		retries: opts?.retries ?? DEFAULT_RETRIES,
		timeout: opts?.timeout ?? DEFAULT_TIMEOUT_MS,
		userAgent: "chebi-mcp-server/1.0 (bio-mcp)",
	});
}
