const MAX_BYTES = 8 * 1024 * 1024;
const failure = (message: string, status: number, data?: unknown) => Object.assign(new Error(message), { status, ...(data === undefined ? {} : { data }) });

/** One deadline covers the existing retrying transport and its response body. */
export async function readChebiResponse(fetchResponse: () => Promise<Response>) {
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { expired = true; reject(failure("ChEBI response exceeded 30 seconds", 504)); }, 30_000);
  });
  try {
    const request = fetchResponse().then(response => {
      if (expired) { void response.body?.cancel().catch(() => undefined); throw failure("ChEBI response timed out", 504); }
      return response;
    });
    const response = await Promise.race([request, deadline]);
    reader = response.body?.getReader();
    if (Number(response.headers.get("content-length")) > MAX_BYTES) throw failure("ChEBI response exceeds 8 MiB; select fewer records", 413);
    const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
    let text = "";
    let bytes = 0;
    if (reader) while (true) {
      const part = await Promise.race([reader.read(), deadline]);
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > MAX_BYTES) throw failure("ChEBI response exceeds 8 MiB; select fewer records", 413);
      text += decoder.decode(part.value, { stream: true });
    }
    text += decoder.decode();
    if (!response.ok) throw failure(`HTTP ${response.status}: ${text.slice(0, 300)}`, response.status, text);
    if (!(response.headers.get("content-type") ?? "").includes("json")) return { status: response.status, data: { text } };
    try { return { status: response.status, data: JSON.parse(text.replace(/^\uFEFF/, "")) as unknown }; }
    catch { throw failure("ChEBI returned invalid JSON", 502, text); }
  } catch (error) {
    if (expired) throw failure("ChEBI response exceeded 30 seconds", 504);
    if (error instanceof Error && "status" in error) throw error;
    throw failure("ChEBI response unavailable or invalid UTF-8", 502);
  } finally {
    clearTimeout(timer);
    void reader?.cancel().catch(() => undefined);
    reader?.releaseLock();
  }
}
