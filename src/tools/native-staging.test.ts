/// <reference types="node" />
import { DatabaseSync } from "node:sqlite";
import { afterEach, expect, it, vi } from "vitest";
import { McpServer } from "@bio-mcp/shared/mcp";
import { hashCanonicalJson, verifyCitationEnvelope } from "@bio-mcp/shared";
import { DynamicWorkerExecutor } from "@bio-mcp/shared/codemode/execute-tool";
vi.mock("cloudflare:workers", () => ({ RpcTarget: class {}, DurableObject: class { constructor(public ctx: unknown, public env: unknown) {} } }));
import { ChebiDataDO } from "../do";
import { registerCodeMode } from "./code-mode";
import { registerQueryData } from "./query-data";
import { registerGetSchema } from "./get-schema";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function createStore() {
  const database = new DatabaseSync(":memory:");
  let ready = Promise.resolve();
  const exec = (query: string, ...values: any[]) => {
    const rows = database.prepare(query).all(...values);
    const iterator = rows[Symbol.iterator]();
    return { toArray: () => rows, one: () => rows[0], next: () => iterator.next(), [Symbol.iterator]: () => iterator };
  };
  const transactionSync = <T>(run: () => T): T => {
    database.exec("BEGIN");
    try { const result = run(); database.exec("COMMIT"); return result; }
    catch (error) { database.exec("ROLLBACK"); throw error; }
  };
  const ctx = { blockConcurrencyWhile: (run: () => Promise<void>) => { ready = run(); return ready; }, storage: { sql: { exec }, transactionSync } };
  const instance = new ChebiDataDO(ctx as unknown as DurableObjectState, {} as Cloudflare.Env);
  return { database, instance, ready };
}

function fixture() {
  // Exercise generated API helpers and user code; replace only the platform isolate.
  vi.spyOn(DynamicWorkerExecutor.prototype, "execute").mockImplementation(async (code, functions) => {
    const staged: Array<Record<string, unknown>> = [];
    try {
      const run = new Function("codemode", "__stagedResults", "console", `return (${code})();`);
      const result = await run(functions, staged, { warn() {}, log() {} });
      return { result: JSON.parse(JSON.stringify(result)), __stagedResults: staged };
    } catch (error) { return { error: String((error as Error).message), __stagedResults: staged }; }
  });
  const stores = new Map<string, ReturnType<typeof createStore>>();
  const namespace = { idFromName: (name: string) => name, get: (id: string) => ({ fetch: async (request: Request) => {
    let store = stores.get(id);
    if (!store) { store = createStore(); stores.set(id, store); }
    await store.ready;
    return store.instance.fetch(request);
  } }) };
  const env = { CHEBI_DATA_DO: namespace, CODE_MODE_LOADER: { get: () => ({}) } } as unknown as Parameters<typeof registerCodeMode>[1];
  const server = new McpServer({ name: "fixture", version: "1" });
  registerCodeMode(server, env); registerQueryData(server, env); registerGetSchema(server, env);
  const tools = (server as unknown as { _registeredTools: Record<string, { handler: (args: unknown, extra: unknown) => Promise<any> }> })._registeredTools;
  return { tools, close: () => { for (const store of stores.values()) store.database.close(); } };
}

async function recover(f: ReturnType<typeof fixture>, id: string, prefix: string) {
  const rows = async (sql: string) => {
    const output = await f.tools[`${prefix}chebi_query_data`].handler({ data_access_id: id, sql }, {});
    expect(output.isError, JSON.stringify(output)).not.toBe(true);
    expect(output.structuredContent.staged).not.toBe(true);
    expect(new TextEncoder().encode(JSON.stringify(output)).byteLength).toBeLessThan(30720);
    return output.structuredContent.data.rows;
  };
  const text = async (table: string, column: string, where: string) => {
    const [{ n }] = await rows(`SELECT length(${column}) AS n FROM ${table} WHERE ${where}`);
    let result = "";
    for (let start = 1; start <= n; start += 1000) {
      const [row] = await rows(`SELECT substr(${column}, ${start}, 1000) AS part FROM ${table} WHERE ${where}`);
      result += row.part;
    }
    return result;
  };
  let raw = await text("payloads", "root_json", "id = 1");
  if (raw.startsWith("__CHUNKED__:")) {
    const chunk = raw.slice("__CHUNKED__:".length);
    expect(chunk).toMatch(/^chunk_[a-f0-9]{32}$/);
    const parts = await rows(`SELECT chunk_index FROM content_chunks WHERE content_id = '${chunk}' ORDER BY chunk_index`);
    raw = "";
    for (const part of parts) raw += await text("content_chunks", "chunk_data", `content_id = '${chunk}' AND chunk_index = ${part.chunk_index}`);
  }
  const decoded = JSON.parse(raw);
  return typeof decoded === "string" ? JSON.parse(decoded) : decoded;
}

const code = " \nreturn await api.get('/native/compound/17234/');\r\n";
const json = (data: unknown, status = 200) => Response.json(data, { status });
const bytes = (data: unknown) => new TextEncoder().encode(JSON.stringify(data)).length;

it("registers both names for discovery, execution and staged access", async () => {
  const f = fixture();
  try {
    for (const prefix of ["", "mcp_"]) {
      for (const suffix of ["search", "execute", "query_data", "get_schema"]) expect(f.tools[`${prefix}chebi_${suffix}`]).toBeDefined();
      const args = { query: "native compound", max_results: 5 };
      const result = await f.tools[`${prefix}chebi_search`].handler(args, {});
      expect(result).toMatchObject({ content: expect.any(Array), structuredContent: { success: true } });
      expect(JSON.stringify(result)).toContain("/native/compound/{chebi_id}/");
      const verified = await verifyCitationEnvelope({ citation: result.structuredContent._meta.citation, structuredContent: result.structuredContent, toolArguments: args });
      expect(verified.verification).toMatchObject({ query: "verified", result: "verified", quarantined: false });
    }
  } finally { f.close(); }
});

it.each(["compound", "batch", "molfile"])("recovers complete native %s evidence through both Code Mode aliases", async mode => {
  const f = fixture();
  const compound = { id: 17234, chebi_accession: "CHEBI:17234", name: 'glucose α 🧬 \\"'.repeat(15000), stars: 3,
    chemical_data: { formula: "C6H12O6", monoisotopicmass: "180.063388104" }, database_accessions: [{ accession_number: "5793", source_name: "PubChem" }], default_structure: { smiles: "C(C1C(C(C(C(O1)O)O)O)O)O" } };
  const text = `\uFEFFcompound α\r\n${'line | \\" 🧬\r\n'.repeat(16000)}M  END\r\n`;
  const native = mode === "batch" ? { "CHEBI:17234": { exists: true, primary: true, data: compound }, "CHEBI:0000": { exists: false, data: null } } : mode === "molfile" ? { text } : compound;
  vi.stubGlobal("fetch", vi.fn(async () => mode === "molfile" ? new Response(text, { headers: { "content-type": "chemical/x-mdl-molfile" } }) : json(native)));
  const program = mode === "batch" ? "return await api.post('/native/compounds/', { chebi_ids: ['CHEBI:17234', 'CHEBI:0000'] });" : mode === "molfile" ? "return await api.get('/native/molfile/17234/');" : code;
  try {
    for (const prefix of ["", "mcp_"]) {
      const result = await f.tools[`${prefix}chebi_execute`].handler({ code: program }, {});
      expect(result.isError, JSON.stringify(result)).not.toBe(true); expect(bytes(result)).toBeLessThan(30720);
      expect(result.structuredContent._staging).toBeDefined();
      const id = result.structuredContent.data_access_id ?? result.structuredContent.data?.data_access_id;
      const recovered = await recover(f, id, prefix);
      expect(recovered).toEqual(native);
      expect(result.structuredContent._meta.citation.result_hash).toBe(await hashCanonicalJson(native));
      expect(result.structuredContent._meta.citation.query_hash).toBe(await hashCanonicalJson(program));
      const verification = await verifyCitationEnvelope({ citation: result.structuredContent._meta.citation, structuredContent: result.structuredContent, toolArguments: { code: program }, materialized: { value: recovered } });
      expect(verification.verification).toMatchObject({ query: "verified", result: "verified", quarantined: false });
      const schema = await f.tools[`${prefix}chebi_get_schema`].handler({ data_access_id: id }, {});
      expect(schema.isError).not.toBe(true); expect(schema.content).toBeDefined(); expect(schema.structuredContent).toBeDefined();
      const verifiedSchema = await verifyCitationEnvelope({ citation: schema.structuredContent._meta.citation, structuredContent: schema.structuredContent, toolArguments: { data_access_id: id } });
      expect(verifiedSchema.verification).toMatchObject({ query: "verified", result: "verified", quarantined: false });
    }
  } finally { f.close(); }
});

it("retains native structure-validation errors and their staged evidence", async () => {
  const f = fixture(); const native = { detail: 'invalid structure α 🧬 \\"'.repeat(12000) };
  vi.stubGlobal("fetch", vi.fn(async () => json(native, 400)));
  try {
    for (const prefix of ["", "mcp_"]) {
      const result = await f.tools[`${prefix}chebi_execute`].handler({ code }, {});
      expect(result).toMatchObject({ isError: true, content: expect.any(Array), structuredContent: { success: false } });
      expect(bytes(result)).toBeLessThan(30720);
      const evidence = result.structuredContent.data.data;
      expect(evidence._staging).toBeDefined();
      const recovered = await recover(f, evidence.data_access_id, prefix);
      expect(recovered === JSON.stringify(native)).toBe(true);
      const verification = await verifyCitationEnvelope({ citation: result.structuredContent._meta.citation, structuredContent: result.structuredContent, toolArguments: { code } });
      expect(verification.verification).toMatchObject({ query: "verified", result: "verified", quarantined: false });
    }
  } finally { f.close(); }
});

it("stages complete escaped execution envelopes and large SQL pages without truncation", async () => {
  const f = fixture();
  const native = { results: Array.from({ length: 150 }, (_, id) => ({ id, accession: `CHEBI:${id}`, exact_mass: "0.000000000000000123", note: 'α|'.repeat(50) })) };
  vi.stubGlobal("fetch", vi.fn(async () => json(native)));
  try {
    for (const prefix of ["", "mcp_"]) {
      const envelopeCode = `return { text: '"'.repeat(15500) };`;
      const envelope = await f.tools[`${prefix}chebi_execute`].handler({ code: envelopeCode }, {});
      expect(bytes(envelope)).toBeLessThan(30720);
      const materialized = await recover(f, envelope.structuredContent.data_access_id, prefix);
      expect(materialized.structuredContent.data.text).toBe('"'.repeat(15500));
      const envelopeVerified = await verifyCitationEnvelope({ citation: envelope.structuredContent._meta.citation, structuredContent: envelope.structuredContent, toolArguments: { code: envelopeCode }, materialized: { value: materialized } });
      expect(envelopeVerified.verification).toMatchObject({ query: "verified", result: "verified", quarantined: false });
      const result = await f.tools[`${prefix}chebi_execute`].handler({ code: "return await api.get('/native/es_search/', { term: 'glucose', size: 150 });" }, {});
      const id = result.structuredContent.data_access_id ?? result.structuredContent.data?.data_access_id;
      const args = { data_access_id: id, sql: "SELECT * FROM results ORDER BY id LIMIT 150", limit: 150 };
      const query = await f.tools[`${prefix}chebi_query_data`].handler(args, {});
      expect(query.isError, JSON.stringify(query)).not.toBe(true); expect(bytes(query)).toBeLessThan(30720);
      const recovered = await recover(f, query.structuredContent.data_access_id, prefix);
      expect(recovered.structuredContent.data.rows).toMatchObject(native.results);
      const verified = await verifyCitationEnvelope({ citation: query.structuredContent._meta.citation, structuredContent: query.structuredContent, toolArguments: args, materialized: { value: recovered } });
      expect(verified.verification).toMatchObject({ query: "verified", result: "verified", quarantined: false });
    }
  } finally { f.close(); }
});

it("keeps OLS ontology scoping and staged SQL alongside native chemistry", async () => {
  const f = fixture(); const docs = Array.from({ length: 150 }, (_, n) => ({ obo_id: `CHEBI:${n}`, short_form: `CHEBI_${n}`, label: `compound ${n}`, ontology_name: "chebi", description: 'α |'.repeat(80) }));
  const native = { response: { docs, numFound: 999, start: 0 }, responseHeader: { params: { q: "compound", ontology: "chebi" } } };
  const fetcher = vi.fn(async () => json(native)); vi.stubGlobal("fetch", fetcher);
  try {
    for (const prefix of ["", "mcp_"]) {
      const result = await f.tools[`${prefix}chebi_execute`].handler({ code: "return await api.get('/search', { q: 'compound', rows: 150 });" }, {});
      expect(result.isError, JSON.stringify(result)).not.toBe(true); expect(bytes(result)).toBeLessThan(30720);
      expect(result.structuredContent._staging.completeness).toMatchObject({ complete: false, returned: 150, total_available: 999 });
      const id = result.structuredContent.data_access_id ?? result.structuredContent.data?.data_access_id;
      expect(await recover(f, id, prefix)).toEqual(native);
      const query = await f.tools[`${prefix}chebi_query_data`].handler({ data_access_id: id, sql: "SELECT count(*) AS n FROM chebi_search_hits" }, {});
      expect(query).toMatchObject({ structuredContent: { data: { rows: [{ n: 150 }] } } });
    }
    const [url] = fetcher.mock.calls[0] as unknown as [string];
    expect(new URL(url).searchParams.get("ontology")).toBe("chebi");
  } finally { f.close(); }
});

it("returns local validation and program failures with both fields and citations", async () => {
  const f = fixture(); const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  try {
    for (const prefix of ["", "mcp_"]) for (const program of ["throw new Error('fixture failure')", "return await api.post('/search', { q: 'glucose' });"]) {
      const result = await f.tools[`${prefix}chebi_execute`].handler({ code: program }, {});
      expect(result).toMatchObject({ isError: true, content: expect.any(Array), structuredContent: { success: false, _meta: { citation: { result_hash: expect.any(String) } } } });
    }
    expect(fetcher).not.toHaveBeenCalled();
  } finally { f.close(); }
});

it.each(["sparse", "multiple"])("materializes OLS HAL collections without absent-column indexes or table collisions (%s)", async mode => {
  const f = fixture();
  const terms = [{ iri: "http://purl.obolibrary.org/obo/CHEBI_17234", description: 'α|🧬'.repeat(15000) }];
  const native = { _embedded: { terms, ...(mode === "multiple" ? { diagnostics: ["native warning"] } : {}) }, page: { totalElements: 1, size: 1, number: 0 } };
  vi.stubGlobal("fetch", vi.fn(async () => json(native)));
  try {
    const result = await f.tools.chebi_execute.handler({ code: "return await api.get('/ontologies/chebi/terms', { size: 1 });" }, {});
    expect(result.isError, JSON.stringify(result)).not.toBe(true);
    const id = result.structuredContent.data_access_id ?? result.structuredContent.data?.data_access_id;
    expect(await recover(f, id, "")).toEqual(native);
    const table = mode === "multiple" ? "terms" : "chebi_terms";
    const query = await f.tools.chebi_query_data.handler({ data_access_id: id, sql: `SELECT iri FROM ${table}` }, {});
    expect(query).toMatchObject({ structuredContent: { data: { rows: [{ iri: terms[0].iri }] } } });
    if (mode === "multiple") expect(await f.tools.chebi_query_data.handler({ data_access_id: id, sql: "SELECT value FROM diagnostics" }, {})).toMatchObject({ structuredContent: { data: { rows: [{ value: "native warning" }] } } });
  } finally { f.close(); }
});

it("keeps native and composed ChEBI pages incomplete and exposes whole-envelope records to SQL", async () => {
  const f = fixture();
  const page = {results:[{_id:"17234",_source:{chebi_accession:"CHEBI:17234"},note:"α".repeat(16000)}],total:975,number_pages:195};
  vi.stubGlobal("fetch",vi.fn(async()=>json(page)));
  try {
    for (const prefix of ["","mcp_"]) {
      const result = await f.tools[`${prefix}chebi_execute`].handler({code:"return await api.get('/native/es_search/',{term:'glucose',size:1});"},{});
      expect(result.structuredContent._staging.completeness).toMatchObject({complete:false,returned:1,total_available:975});
      const id = result.structuredContent.data.data_access_id;
      expect(await recover(f,id,prefix)).toEqual(page);
      const composed = await f.tools[`${prefix}chebi_execute`].handler({code:"return {page:{results:[{id:1}],total:975,number_pages:195},note:'α'.repeat(16000)};"},{});
      expect(composed.structuredContent._meta.completeness).toMatchObject({complete:false,returned:1,total_available:975});
      expect(composed.structuredContent._staging.completeness.complete).toBe(false);
      expect((await recover(f,composed.structuredContent.data_access_id,prefix)).structuredContent.data.page.total).toBe(975);
    }
  } finally { f.close(); }
});
