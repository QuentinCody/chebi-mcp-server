import { afterEach, expect, it, vi } from "vitest";
import { readChebiResponse } from "./response";
import { createChebiApiFetch } from "./api-adapter";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("preserves BOM, line endings, pipe characters and Unicode in structure text", async () => {
  const text = '\uFEFFα| 🧬\r\nM  END\r\n';
  expect(await readChebiResponse(async () => new Response(text, { headers: { "content-type": "chemical/x-mdl-molfile" } }))).toEqual({ status: 200, data: { text } });
});

it("accepts an empty structure response as documented without inventing a compound", async () => {
  expect(await readChebiResponse(async () => new Response(null, { headers: { "content-type": "chemical/x-mdl-molfile" } }))).toEqual({ status: 200, data: { text: "" } });
});

it("decodes UTF-8 split across response chunks and retains native JSON values", async () => {
  const data = { label: "α🧬", mass: "1e-500", stars: 2, mapping: null, values: ["a|b", "", " c "] };
  const bytes = new TextEncoder().encode(`\uFEFF${JSON.stringify(data)}`);
  const body = new ReadableStream({ start(controller) { for (const byte of bytes) controller.enqueue(new Uint8Array([byte])); controller.close(); } });
  expect(await readChebiResponse(async () => new Response(body, { headers: { "content-type": "application/json" } }))).toEqual({ status: 200, data });
});

it.each([400, 404, 429, 503])("retains the complete HTTP %s error body", async status => {
  const text = JSON.stringify({ detail: "α 🧬 ".repeat(5000) });
  await expect(readChebiResponse(async () => new Response(text, { status }))).rejects.toMatchObject({ status, data: text });
});

it.each(["{broken", "", "\uFEFF{"])("retains malformed JSON as explicit upstream failure (%j)", async text => {
  await expect(readChebiResponse(async () => new Response(text, { headers: { "content-type": "application/json" } }))).rejects.toMatchObject({ status: 502, data: text });
});

it("rejects malformed UTF-8 without substituting characters", async () => {
  await expect(readChebiResponse(async () => new Response(new Uint8Array([0xff])))).rejects.toMatchObject({ status: 502 });
});

it.each(["header", "stream"])("bounds response bytes from the %s", async mode => {
  const cancel = vi.fn();
  const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(mode === "stream" ? 8 * 1024 * 1024 + 1 : 1)); }, cancel });
  await expect(readChebiResponse(async () => new Response(body, { headers: mode === "header" ? { "content-length": "9000000" } : {} }))).rejects.toMatchObject({ status: 413 });
  expect(cancel).toHaveBeenCalledOnce();
});

it.each(["headers", "body"])("enforces a deadline while waiting for %s", async mode => {
  vi.useFakeTimers(); const cancel = vi.fn();
  const promise = readChebiResponse(() => mode === "headers" ? new Promise(() => {}) : Promise.resolve(new Response(new ReadableStream({ pull: () => new Promise(() => {}), cancel }))));
  const rejected = expect(promise).rejects.toMatchObject({ status: 504 });
  await vi.advanceTimersByTimeAsync(30_001); await rejected;
  if (mode === "body") expect(cancel).toHaveBeenCalledOnce();
});

it("shares the deadline between headers and body and never waits on cancellation", async () => {
  vi.useFakeTimers(); const cancel = vi.fn(() => new Promise<void>(() => {}));
  const promise = readChebiResponse(() => new Promise(resolve => setTimeout(() => resolve(new Response(new ReadableStream({ pull: () => new Promise(() => {}), cancel }))), 29_000)));
  const rejected = expect(promise).rejects.toMatchObject({ status: 504 });
  await vi.advanceTimersByTimeAsync(30_001); await rejected; expect(cancel).toHaveBeenCalledOnce();
});

it("cancels a response that arrives after the deadline", async () => {
  vi.useFakeTimers(); let deliver!: (response: Response) => void;
  const cancel = vi.fn();
  const promise = readChebiResponse(() => new Promise(resolve => { deliver = resolve; }));
  const rejected = expect(promise).rejects.toMatchObject({ status: 504 });
  await vi.advanceTimersByTimeAsync(30_001); await rejected;
  deliver(new Response(new ReadableStream({ cancel })));
  await Promise.resolve(); expect(cancel).toHaveBeenCalledOnce();
});

it.each([
  { method: "DELETE", path: "/native/compound/1/" },
  { method: "PUT", path: "/native/compound/1/", body: {} },
  { method: "POST", path: "/search", body: {} },
  { method: "GET", path: "/native/compounds/", body: { chebi_ids: ["CHEBI:1"] } },
])("rejects unsupported requests without silently converting them to GET: %j", async request => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  await expect(createChebiApiFetch()(request)).rejects.toMatchObject({ status: 405 });
  expect(fetcher).not.toHaveBeenCalled();
});
