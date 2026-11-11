import type { Completeness } from "@bio-mcp/shared";
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

function directCompleteness(data: unknown): Completeness | undefined {
  if (!record(data) || data.__staged === true) return undefined;
  let rows: unknown[] | undefined;
  let total: unknown;
  if (Array.isArray(data.results) && typeof data.total === "number") { rows = data.results; total = data.total; }
  else if (record(data.response) && Array.isArray(data.response.docs)) { rows = data.response.docs; total = data.response.numFound; }
  else if (record(data._embedded) && Array.isArray(data._embedded.terms) && record(data.page)) { rows = data._embedded.terms; total = data.page.totalElements; }
  if (!rows) return undefined;
  return {complete:false,returned:rows.length,...(typeof total === "number" && Number.isFinite(total) ? {total_available:total} : {}),
    truncation:{reason:"unknown",detail:"This native search or ontology page does not establish complete query coverage.",remedy:"Retain filters, page bounds, native totals, links and observed index/version fields while traversing. Live pages are not an immutable snapshot; search similarity/connectivity does not establish exact chemical identity."}};
}

/** Preserve native coverage limits when a program returns composed evidence. */
export function chebiCompleteness(data: unknown): Completeness | undefined {
  const observations: Completeness[] = [];
  const pending = [data];
  while (pending.length) {
    const value = pending.pop();
    if (!value || typeof value !== "object") continue;
    const direct = directCompleteness(value);
    if (direct) { observations.push(direct); continue; }
    if (record(value) && value.__staged === true) {
      const staging = value._staging;
      if (record(staging) && record(staging.completeness) && staging.completeness.complete === false)
        observations.push({ ...staging.completeness, complete: false });
      continue;
    }
    for (const child of Object.values(value)) pending.push(child);
  }
  if (observations.length === 0) return undefined;
  if (observations.length === 1) return observations[0];
  return { complete: false, truncation: { reason: "unknown",
    detail: "Composed ChEBI evidence includes multiple native observations with unverified coverage.",
    remedy: "Retain the native identifiers, counts, page bounds and source metadata of each native response separately." } };
}
