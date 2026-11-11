// interlinked-tdd: exempt
import { RestStagingDO } from "@bio-mcp/shared/staging/rest-staging-do";
import { detectArrays, type SchemaHints } from "@bio-mcp/shared/staging/schema-inference";

const ENTITY_KEY = "object";
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

export class ChebiDataDO extends RestStagingDO {
  protected getTabularData(value: unknown): unknown {
    const data = record(value) && Array.isArray(value.content) && record(value.structuredContent) && "data" in value.structuredContent
      ? value.structuredContent.data : value;
    // Avoid colliding with staging's generated _rowid when restaging SQL rows.
    if (record(data) && typeof data.sql === "string" && Array.isArray(data.rows)) return { query_rows: data.rows.map(native => ({native})) };
    if (record(data) && record(data.response) && Array.isArray(data.response.docs)) return { chebi_search_hits: data.response.docs };
    return data;
  }

	protected getSchemaHints(data: unknown): SchemaHints | undefined {
		if (!data || typeof data !== ENTITY_KEY) return undefined;
		const obj = data as Record<string, unknown>;

		// OLS4 HAL list response: { _embedded: { terms: [...] } } — auto-detected
		// by the base detectArrays(); add hints here for naming + indexes.
		if (obj._embedded && typeof obj._embedded === ENTITY_KEY) {
			const emb = obj._embedded as Record<string, unknown>;
			if (Array.isArray(emb.terms)) {
				const arrays = detectArrays(data);
				if (arrays.length !== 1 || arrays[0].rows !== emb.terms) return undefined;
				const sampled = emb.terms.slice(0, 1000);
				return {
					tableName: "chebi_terms",
					indexes: ["obo_id", "short_form", "label", "iri"].filter(key => sampled.some(row => record(row) && Object.prototype.hasOwnProperty.call(row, key))),
					flatten: { annotation: 1 },
				};
			}
		}

		return undefined;
	}
}
