import { afterEach, describe, expect, it, vi } from "vitest";
import { createChebiApiFetch } from "./api-adapter";

afterEach(() => vi.unstubAllGlobals());

describe("ChEBI native and OLS routing", () => {
  it("retains OLS ontology scoping and its existing base override", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ response: { docs: [{ obo_id: "CHEBI:17234" }] } }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await createChebiApiFetch({ CHEBI_BASE_URL: "https://ols.example/api" })({ method: "GET", path: "/search", params: { q: "glucose" } });
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.origin + url.pathname).toBe("https://ols.example/api/search");
    expect(url.searchParams.get("ontology")).toBe("chebi");
    expect(result.data).toEqual({ response: { docs: [{ obo_id: "CHEBI:17234" }] } });
  });

  it("routes native compound records independently of the OLS base and retains curation metadata", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ id: 17234, chebi_accession: "CHEBI:17234", stars: 3, name: "glucose", chemical_data: { formula: "C6H12O6" }, default_structure: null }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await createChebiApiFetch({ CHEBI_BASE_URL: "https://ols.example/api" })({ method: "GET", path: "/native/compound/17234/" });
    expect(fetchMock.mock.calls[0][0]).toBe("https://www.ebi.ac.uk/chebi/backend/api/public/compound/17234/");
    expect(result.data).toMatchObject({ id: 17234, chebi_accession: "CHEBI:17234", stars: 3, chemical_data: { formula: "C6H12O6" }, default_structure: null });
  });

  it("forwards a native POST JSON body and query parameters without adding OLS parameters", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ results: [] }));
    vi.stubGlobal("fetch", fetchMock);
    await createChebiApiFetch()({ method: "POST", path: "/native/structure_search/", body: { structure: "CCO", type: "connectivity" }, params: { size: 5, three_star_only: false } });
    const [input, init] = fetchMock.mock.calls[0];
    const url = new URL(input);
    expect(url.pathname).toBe("/chebi/backend/api/public/structure_search/");
    expect(url.searchParams.get("ontology")).toBeNull();
    expect(url.searchParams.get("three_star_only")).toBe("false");
    expect(url.searchParams.get("size")).toBe("5");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual({ structure: "CCO", type: "connectivity" });
  });

  it.each([
    ["/native/molfile/17234/", "chemical/x-mdl-molfile", "molecule\nM  END\n"],
    ["/native/compound/17234/structure/", "image/svg+xml", '<svg xmlns="http://www.w3.org/2000/svg"></svg>'],
  ])("preserves text structure output from %s", async (path, contentType, text) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(text, { headers: { "Content-Type": contentType } })));
    expect(await createChebiApiFetch()({ method: "GET", path })).toEqual({ status: 200, data: { text } });
  });

  it("propagates provider validation errors without disguising them as empty search results", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ detail: "Invalid structure" }, { status: 400 })));
    await expect(createChebiApiFetch()({ method: "POST", path: "/native/structure_search/", body: { structure: "invalid" } })).rejects.toMatchObject({ status: 400, message: expect.stringContaining("Invalid structure") });
  });
});
