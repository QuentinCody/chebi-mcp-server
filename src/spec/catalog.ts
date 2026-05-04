// interlinked-tdd: exempt
import type { ApiCatalog } from "@bio-mcp/shared/codemode/catalog";

/**
 * ChEBI MCP server catalog (OLS4-backed).
 *
 * ChEBI is the EBI's chemical ontology of small biological molecules — the
 * canonical chemistry vocabulary that underpins ChEMBL and HMDB cross-
 * references. The native ChEBI Web Services API is SOAP-only; the modern
 * REST surface is exposed through OLS4 (Ontology Lookup Service v4) at
 * https://www.ebi.ac.uk/ols4/api.
 *
 * The api-adapter pins `ontology=chebi` on `/search`, `/select`, and
 * `/suggest` calls automatically, so callers can omit it. Endpoints under
 * `/ontologies/chebi/...` already scope themselves.
 *
 * Notable response fields on ChEBI terms:
 * - `obo_id` (e.g. "CHEBI:17234"), `short_form` ("CHEBI_17234"), `iri`
 * - `label`, `description`, `synonyms`
 * - `annotation.charge`, `annotation.mass`, `annotation.monoisotopic_mass`
 * - `annotation.generalized_empirical_formula` (molecular formula)
 * - `annotation.smiles`, `annotation.inchi`, `annotation.inchikey` (when present)
 * - `annotation.database_cross_reference` (KEGG, CAS, Wikipedia, etc.)
 * - `annotation.has_alternative_id` (legacy ChEBI IDs)
 */
export const chebiCatalog: ApiCatalog = {
	name: "ChEBI (via OLS4)",
	baseUrl: "https://www.ebi.ac.uk/ols4/api",
	version: "OLS4 / ChEBI 251",
	auth: "none",
	endpointCount: 11,
	notes:
		"- ChEBI is served via the EBI Ontology Lookup Service (OLS4). The native ChEBI Web Services API is SOAP-only and not used here.\n" +
		"- /search, /select, and /suggest are auto-pinned to `ontology=chebi` by the adapter — callers can omit `ontology` on those.\n" +
		"- IRI/path-segment quirks: OLS4 paths that take an IRI as a path segment (e.g. /ontologies/chebi/terms/{iri}) require DOUBLE URL-encoding of the IRI. Example: `http://purl.obolibrary.org/obo/CHEBI_17234` → `http%253A%252F%252Fpurl.obolibrary.org%252Fobo%252FCHEBI_17234`. Code Mode `api.get` does single-URL-encoding when interpolating path params; for term-detail endpoints, prefer the `?iri=...` query-param form documented below — it only requires single encoding.\n" +
		"- ID formats: ChEBI uses two interchangeable forms — short_form `CHEBI_17234` and obo_id `CHEBI:17234`. The IRI form is `http://purl.obolibrary.org/obo/CHEBI_17234`. Search responses include all three.\n" +
		"- Cross-reference enrichment: every term carries `annotation.database_cross_reference` with URIs like `kegg.compound:C00031`, `cas:50-99-7`, `wikipedia.en:Glucose`. Use these to chain into kegg-mcp-server, pubchem-mcp-server, unichem-mcp-server.\n" +
		"- Hierarchy navigation: /children, /descendants, /parents, /ancestors take the term IRI in path. Combine with `?size=200` for batch traversal.\n" +
		"- HAL+JSON envelope: list responses wrap arrays in `_embedded.terms` with `_links` and `page` metadata. The staging engine auto-unwraps this — staged tables come out as `chebi_terms`.\n" +
		"- Search responses use a different envelope: `{ response: { docs: [...], numFound: N } }`. Staged into `chebi_search_hits`.",
	endpoints: [
		// ── search ───────────────────────────────────────────────
		{
			method: "GET",
			path: "/search",
			summary:
				"Full-text search across ChEBI. Matches label, synonyms, and descriptions. Returns ranked hits with `obo_id`, `iri`, `label`, `description`, `synonyms`.",
			category: "search",
			queryParams: [
				{
					name: "q",
					type: "string",
					required: true,
					description: "Free-text query (e.g. `glucose`, `aspirin`, `C6H12O6`).",
				},
				{
					name: "ontology",
					type: "string",
					required: false,
					description: "Pinned to `chebi` automatically. Override only if you know what you're doing.",
					default: "chebi",
				},
				{
					name: "exact",
					type: "boolean",
					required: false,
					description: "Require exact label/synonym match.",
				},
				{
					name: "queryFields",
					type: "string",
					required: false,
					description:
						"Comma-separated fields to search in (e.g. `label,synonym,description,iri,short_form,obo_id,annotations`).",
				},
				{
					name: "fieldList",
					type: "string",
					required: false,
					description:
						"Comma-separated fields to return (default returns the standard set).",
				},
				{
					name: "rows",
					type: "number",
					required: false,
					description: "Page size (default 10, max 1000).",
					default: 10,
				},
				{
					name: "start",
					type: "number",
					required: false,
					description: "Result offset for pagination.",
					default: 0,
				},
			],
		},
		{
			method: "GET",
			path: "/select",
			summary:
				"Auto-complete / type-ahead style search. Returns the same envelope as /search but pre-tokenized for prefix matches. Use this when ranking by relevance is less important than speed.",
			category: "search",
			queryParams: [
				{
					name: "q",
					type: "string",
					required: true,
					description: "Prefix or partial query.",
				},
				{
					name: "ontology",
					type: "string",
					required: false,
					description: "Pinned to `chebi` automatically.",
					default: "chebi",
				},
				{
					name: "rows",
					type: "number",
					required: false,
					description: "Page size (default 10, max 1000).",
					default: 10,
				},
			],
		},
		{
			method: "GET",
			path: "/suggest",
			summary: "Lightweight type-ahead suggestions. Returns just labels — useful for UI autocomplete, not for data work.",
			category: "search",
			queryParams: [
				{
					name: "q",
					type: "string",
					required: true,
					description: "Prefix or partial query.",
				},
				{
					name: "ontology",
					type: "string",
					required: false,
					description: "Pinned to `chebi` automatically.",
					default: "chebi",
				},
			],
		},

		// ── ontology metadata ───────────────────────────────────
		{
			method: "GET",
			path: "/ontologies/chebi",
			summary:
				"ChEBI ontology metadata: version, term count, last-loaded timestamp, configured cross-reference databases.",
			category: "ontology",
		},

		// ── term details ─────────────────────────────────────────
		{
			method: "GET",
			path: "/ontologies/chebi/terms",
			summary:
				"Term details by IRI (preferred form). Returns the full annotation block including formula, mass, charge, SMILES/InChI, and cross-references.",
			category: "terms",
			queryParams: [
				{
					name: "iri",
					type: "string",
					required: true,
					description:
						"Term IRI (e.g. `http://purl.obolibrary.org/obo/CHEBI_17234`). Single URL-encoded by Code Mode.",
				},
			],
		},
		{
			method: "GET",
			path: "/ontologies/chebi/terms/{iri}",
			summary:
				"Term details by IRI in path segment. ⚠️ The IRI must be DOUBLE-URL-encoded — Code Mode's auto-interpolation only encodes once, so prefer the `?iri=...` query-param form above.",
			category: "terms",
			pathParams: [
				{
					name: "iri",
					type: "string",
					required: true,
					description: "Double-URL-encoded term IRI.",
				},
			],
		},

		// ── hierarchy ────────────────────────────────────────────
		{
			method: "GET",
			path: "/ontologies/chebi/terms/{iri}/children",
			summary: "Direct children (is-a) of a term.",
			category: "hierarchy",
			pathParams: [
				{
					name: "iri",
					type: "string",
					required: true,
					description: "Double-URL-encoded term IRI.",
				},
			],
			queryParams: [
				{
					name: "size",
					type: "number",
					required: false,
					description: "Page size (default 20, max 200).",
					default: 20,
				},
				{
					name: "page",
					type: "number",
					required: false,
					description: "Zero-indexed page number.",
				},
			],
		},
		{
			method: "GET",
			path: "/ontologies/chebi/terms/{iri}/descendants",
			summary: "All descendants (is-a transitive closure) of a term.",
			category: "hierarchy",
			pathParams: [
				{
					name: "iri",
					type: "string",
					required: true,
					description: "Double-URL-encoded term IRI.",
				},
			],
			queryParams: [
				{
					name: "size",
					type: "number",
					required: false,
					description: "Page size (default 20, max 200).",
					default: 20,
				},
				{
					name: "page",
					type: "number",
					required: false,
					description: "Zero-indexed page number.",
				},
			],
		},
		{
			method: "GET",
			path: "/ontologies/chebi/terms/{iri}/parents",
			summary: "Direct parents (is-a) of a term.",
			category: "hierarchy",
			pathParams: [
				{
					name: "iri",
					type: "string",
					required: true,
					description: "Double-URL-encoded term IRI.",
				},
			],
		},
		{
			method: "GET",
			path: "/ontologies/chebi/terms/{iri}/ancestors",
			summary: "All ancestors of a term (is-a transitive closure upward).",
			category: "hierarchy",
			pathParams: [
				{
					name: "iri",
					type: "string",
					required: true,
					description: "Double-URL-encoded term IRI.",
				},
			],
			queryParams: [
				{
					name: "size",
					type: "number",
					required: false,
					description: "Page size (default 20, max 200).",
					default: 20,
				},
			],
		},

		// ── cross-references ─────────────────────────────────────
		{
			method: "GET",
			path: "/ontologies/chebi/terms/{iri}/jstree",
			summary:
				"Tree-view representation of a term's location in the ChEBI hierarchy (jsTree-compatible JSON). Useful for visualizing where a term sits.",
			category: "hierarchy",
			pathParams: [
				{
					name: "iri",
					type: "string",
					required: true,
					description: "Double-URL-encoded term IRI.",
				},
			],
		},
	],
};
