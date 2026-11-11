import type { ApiEndpoint, ParamDef } from "@bio-mcp/shared/codemode/catalog";

// Provider schema: https://www.ebi.ac.uk/chebi/backend/api/schema/?format=json
// /native is a local routing prefix for /chebi/backend/api/public.
const paging: ParamDef[] = [
  { name: "page", type: "number", required: false, description: "One-based page number", default: 1 },
  { name: "size", type: "number", required: false, description: "Page size; keep bounded", default: 15 },
];
const chemistryFilters: ParamDef[] = [
  ...paging,
  { name: "three_star_only", type: "boolean", required: false, description: "Defaults true (three-star curated entries); false includes two-star entries", default: true },
];

export const nativeEndpoints: ApiEndpoint[] = [
  {
    method: "GET", path: "/native/compound/{chebi_id}/", category: "native chemistry",
    summary: "Native ChEBI chemical record, including structures, identifiers, cross-references and curation metadata when present.",
    pathParams: [{ name: "chebi_id", type: "string", required: true, description: "Numeric ID or CHEBI-prefixed accession, e.g. 17234 or CHEBI:17234" }],
    example: "return await api.get('/native/compound/17234/');",
  },
  {
    method: "GET", path: "/native/compounds/", category: "native chemistry",
    summary: "Retrieve multiple native chemical records by comma-separated ChEBI identifiers.",
    queryParams: [{ name: "chebi_ids", type: "string", required: true, description: "e.g. CHEBI:18357,chebi:22982,5974" }],
  },
  {
    method: "POST", path: "/native/compounds/", category: "native chemistry",
    summary: "Batch compound results keyed by accession, with existence, primary-ID metadata and nested data. This differs from the GET response shape.",
    body: { contentType: "application/json", description: "{chebi_ids: string[]}; use bounded batches" },
    example: "return await api.post('/native/compounds/', {chebi_ids: ['CHEBI:17234', 'CHEBI:15377']});",
  },
  {
    method: "GET", path: "/native/es_search/", category: "native search",
    summary: "Search the native ChEBI chemistry database by text, name or identifier.",
    queryParams: [{ name: "term", type: "string", required: true, description: "Search term, e.g. glucose" }, ...paging],
  },
  {
    method: "GET", path: "/native/structure_search/", category: "native structures",
    summary: "Find compounds by SMILES connectivity, substructure or similarity.",
    queryParams: [
      { name: "smiles", type: "string", required: true, description: "SMILES molecular structure, e.g. CCO" },
      { name: "search_type", type: "string", required: true, description: "connectivity, substructure or similarity" },
      { name: "similarity", type: "number", required: false, description: "Similarity threshold 0.4–1.0 for similarity searches" },
      ...chemistryFilters,
    ],
  },
  {
    method: "POST", path: "/native/structure_search/", category: "native structures",
    summary: "Search by SMILES or MOLFILE/SDF structure with connectivity, substructure or similarity matching.",
    queryParams: chemistryFilters,
    body: { contentType: "application/json", description: "{structure: string, type: 'connectivity'|'substructure'|'similarity', similarity?: number}; POST uses structure/type, unlike GET smiles/search_type" },
    example: "return await api.post('/native/structure_search/', {structure: 'CCO', type: 'connectivity'}, {size: 5});",
  },
  {
    method: "POST", path: "/native/advanced_search/", category: "native search",
    summary: "Combine chemical formula, mass, charge, ontology, database-reference and text constraints.",
    queryParams: [...chemistryFilters, { name: "has_structure", type: "boolean", required: false, description: "Optional structure-presence filter" }],
    body: { contentType: "application/json", description: "FullSpecification from the provider schema. For formula: {formula_specification: {and_specification: [{term: 'C10H7NO4'}]}}. Mass ranges use init_range/final_range; ontology clauses use relation/entity." },
    example: "return await api.post('/native/advanced_search/', {formula_specification: {and_specification: [{term: 'C10H7NO4'}]}}, {three_star_only: false, size: 5});",
  },
  {
    method: "GET", path: "/native/advanced_search/sources_list", category: "native search",
    summary: "Discover database source names accepted by native advanced search.",
  },
  {
    method: "GET", path: "/native/molfile/{id}/", category: "native structures",
    summary: "Retrieve a parent compound's default-structure MOLFILE as {text}; provider documents an empty file when no default structure exists.",
    pathParams: [{ name: "id", type: "number", required: true, description: "Numeric ChEBI compound ID with a structure, e.g. 15377; ontology-only entries may lack a MOLFILE" }],
  },
  {
    method: "GET", path: "/native/compound/{id}/structure/", category: "native structures",
    summary: "Retrieve the compound structure as SVG text; returned as {text}, not parsed chemical evidence.",
    pathParams: [{ name: "id", type: "number", required: true, description: "Numeric ChEBI compound ID" }],
    queryParams: [
      { name: "width", type: "number", required: false, description: "SVG width", default: 300 },
      { name: "height", type: "number", required: false, description: "SVG height", default: 300 },
    ],
  },
];
