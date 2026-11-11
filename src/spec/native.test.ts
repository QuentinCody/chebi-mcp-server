import { describe, expect, it } from "vitest";
import { nativeEndpoints } from "./native";

describe("ChEBI native discovery contract", () => {
  it("distinguishes provider GET and POST structure search parameters", () => {
    const get = nativeEndpoints.find((e) => e.path === "/native/structure_search/" && e.method === "GET");
    const post = nativeEndpoints.find((e) => e.path === "/native/structure_search/" && e.method === "POST");
    expect(get?.queryParams).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "smiles", required: true }),
      expect.objectContaining({ name: "search_type", required: true }),
    ]));
    expect(post?.body?.description).toContain("structure: string");
    expect(post?.body?.description).toContain("type:");
    expect(post?.queryParams).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "three_star_only", default: true }),
    ]));
  });

  it("exposes compound records and chemical file downloads with their distinct output formats", () => {
    expect(nativeEndpoints).toEqual(expect.arrayContaining([
      expect.objectContaining({ method: "GET", path: "/native/compound/{chebi_id}/" }),
      expect.objectContaining({ method: "GET", path: "/native/molfile/{id}/", summary: expect.stringContaining("{text}") }),
      expect.objectContaining({ method: "GET", path: "/native/compound/{id}/structure/", summary: expect.stringContaining("SVG") }),
    ]));
  });
});
