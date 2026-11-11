# ChEBI MCP Server

This is a [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server. It lets MCP clients (Claude Desktop, Claude Code, Continue, etc.) query the upstream ChEBI API in natural language. It is one of 100+ servers in the [Bio MCP](../../README.md) monorepo.

## Connect

The server is deployed and ready at:

```
https://chebi-mcp-server.quentincody.workers.dev/mcp
```

Add it to your MCP client (Claude Desktop → Settings → Developer → Edit Config):

```json
{
  "mcpServers": {
    "chebi": {
      "command": "npx",
      "args": ["mcp-remote", "https://chebi-mcp-server.quentincody.workers.dev/mcp"]
    }
  }
}
```

For local development the server runs at `http://localhost:8899/mcp` (start it with `./scripts/dev-servers.sh chebi`):

```json
{
  "mcpServers": {
    "chebi-local": {
      "command": "npx",
      "args": ["mcp-remote", "http://localhost:8899/mcp"]
    }
  }
}
```

## Tools

- `chebi_search` — discover native ChEBI chemistry and OLS4 ontology operations
- `chebi_execute` — **Code Mode**: write JavaScript in a V8 isolate (`api.get()` / `api.post()` / `searchSpec()`) instead of issuing tool calls one by one
- `chebi_query_data` — run SQL over large responses auto-staged into a per-session SQLite database
- `chebi_get_schema` — inspect the inferred schema of a staged dataset

Large responses (>30KB) are auto-staged into a queryable SQLite database; the tools return a `data_access_id` you can query with SQL.

Every tool returns both a human-readable `content` summary and a structured `structuredContent` payload.

All four tools also register the `mcp_chebi_*` alias and return verifiable
citations on success and failure. Code Mode preserves the exact caller program
in its query hash. Complete search, execution, SQL and schema responses over
30KB stage before transport, including composed results and native error evidence.

Native chemistry and OLS reads have an 8 MiB input cap and a 30-second deadline
covering headers and body. Smaller pages can be processed and joined in Code
Mode. MOLFILE/SVG text preserves UTF-8, byte-order marks and line endings. Native
GET/POST reads and OLS GET remain distinct; unsupported methods fail explicitly.

For staged data, inspect `chebi_get_schema` before writing SQL. OLS search hits
materialize as `chebi_search_hits`; a single HAL terms collection uses
`chebi_terms`, while multiple collections remain separate. Original envelopes,
including curation, identifier-resolution, paging and error context, remain in
`payloads.root_json`. Values marked `__CHUNKED__:` refer to ordered
`content_chunks`; read long strings in bounded SQL substrings. A staged page
retains conservative completeness metadata, including native totals and returned
row counts, through inline, staged and composed responses. Traversing live pages
does not pin an immutable snapshot or establish chemical identity.

October 3 native/local acceptance verifies 18 successful cases through both tool
aliases: primary/secondary identifiers, both batch methods, text pages,
structure/similarity/formula search, source names, MOLFILE, SVG and OLS search/detail.
Complete native payloads, 100-row native/OLS pages and SQL results recover with
verified citations. Native 400/404 evidence and composed page coverage also pass.
The run made 810 MCP calls, including 16 staged proofs. Local Workerd used
installed public CA roots with verified TLS; production was not deployed.

The observed aspirin record is `CHEBI:15365` (acetylsalicylic acid), with full
InChIKey `BSYNRYMUTXBXSQ-UHFFFAOYSA-N`; secondary `CHEBI:2890` resolves to it.
Native glucose search reported 975 matches and index
`chebi-prod-compounds-03102026`. This observed index and OpenAPI software version
`2.0.0` are distinct metadata, not an asserted dataset release.

## Development

ChEBI 2.0 [replaced SOAP with REST](https://www.ebi.ac.uk/about/news/updates-from-data-resources/chebi-2-0-launches/). Paths beginning `/native/` route to its [public REST API](https://www.ebi.ac.uk/chebi/backend/api/docs/); existing paths still use OLS4. `CHEBI_BASE_URL` overrides OLS4 only.

```javascript
const compound = await api.get('/native/compound/17234/');
const matches = await api.post('/native/structure_search/',
  {structure: 'CCO', type: 'connectivity'}, {size: 5});
return {compound, matches};
```

Native operations cover compound/batch retrieval, text and advanced formula/mass searches, structure matching, MOLFILE, and SVG. Preserve native identifiers and curation stars; chemical searches default to three-star entries, with `three_star_only: false` including two-star entries. Non-JSON structure files return `{text}`. OLS remains useful for ontology traversal and keeps its own response format.

[Bulk data products](https://ftp.ebi.ac.uk/pub/databases/chebi/) include ontology, TSV, SDF, JSON, and PostgreSQL downloads; these are separate from the request-time API. Dataset release identifiers should come from provider metadata, not the REST software version.

```bash
./scripts/dev-servers.sh chebi            # run locally (port 8899)
pnpm --filter chebi-mcp-server run deploy   # deploy to Cloudflare Workers
```

See [`docs/adding-mcp-servers.md`](../../docs/adding-mcp-servers.md) and the root [README](../../README.md) for the full architecture (Code Mode, staging, portals).

---

*Auto-generated baseline README — refine with server-specific detail as needed.*

<!-- license-and-data-terms:start -->
## License and data terms

The code in this repository is licensed under the Apache License 2.0 (see `LICENSE`).
If you use it in your work, please cite it (see `CITATION.cff`). Citation is requested, not required.

The license covers the code only. Data that this server returns comes from ChEBI and stays under the terms of that source: CC BY 4.0.
You are responsible for your use of the data under those terms.
<!-- license-and-data-terms:end -->
