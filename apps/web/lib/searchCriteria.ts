import type { Classification } from "@odovi/core";
import type { SearchType } from "./search";
import { isValidDateParam } from "./day";

const classifications: Classification[] = ["unclassified", "private", "business", "commute"];

/** The bare entry screen differs from an explicitly selected result type. */
export function parseSearchCriteria(params: { q?: string; from?: string; to?: string; classification?: string; type?: string }) {
  const q = params.q?.trim() ?? "";
  const from = params.from && isValidDateParam(params.from) ? params.from : "";
  const to = params.to && isValidDateParam(params.to) ? params.to : "";
  const selected = [...new Set((params.classification ?? "").split(",").map((v) => v.trim())
    .filter((v): v is Classification => classifications.includes(v as Classification)))];
  const explicitType = params.type === "drives" || params.type === "charges" || params.type === "all";
  const type: SearchType = explicitType ? params.type as SearchType : "drives";
  return { q, from, to, classifications: selected, type, shouldSearch: Boolean(q || from || to || selected.length || explicitType) };
}
