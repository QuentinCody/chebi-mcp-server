// interlinked-tdd: exempt
import { RestStagingDO } from "@bio-mcp/shared/staging/rest-staging-do";
import type { SchemaHints } from "@bio-mcp/shared/staging/schema-inference";

const ENTITY_KEY = "object";

export class ChebiDataDO extends RestStagingDO {
	protected getSchemaHints(data: unknown): SchemaHints | undefined {
		if (!data || typeof data !== ENTITY_KEY) return undefined;
		const obj = data as Record<string, unknown>;

		// OLS4 search response: { response: { docs: [...] } }
		if (obj.response && typeof obj.response === ENTITY_KEY) {
			const inner = obj.response as Record<string, unknown>;
			if (Array.isArray(inner.docs)) {
				return {
					tableName: "chebi_search_hits",
					indexes: ["obo_id", "short_form", "label", "ontology_name"],
				};
			}
		}

		// OLS4 HAL list response: { _embedded: { terms: [...] } } — auto-detected
		// by the base detectArrays(); add hints here for naming + indexes.
		if (obj._embedded && typeof obj._embedded === ENTITY_KEY) {
			const emb = obj._embedded as Record<string, unknown>;
			if (Array.isArray(emb.terms)) {
				return {
					tableName: "chebi_terms",
					indexes: ["obo_id", "short_form", "label", "iri"],
					flatten: { annotation: 1 },
				};
			}
		}

		return undefined;
	}
}
