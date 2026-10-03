import { isValidDateParam } from "./day";

/** Only local archive lists are accepted as detail return destinations. */
export function archiveReturnTo(raw: string | undefined, fallback: string): string {
  if (!raw || raw.length > 4096 || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return fallback;
  const url = new URL(raw, "http://odovi.local");
  if (url.origin !== "http://odovi.local") return fallback;
  const day = /^\/day\/(\d{4}-\d{2}-\d{2})$/.exec(url.pathname);
  if (url.pathname !== "/search" && !(day && isValidDateParam(day[1]))) return fallback;
  const allowed = url.pathname === "/search"
    ? ["q", "type", "from", "to", "classification", "vehicle"] : ["vehicle", "month"];
  for (const key of [...url.searchParams.keys()]) if (!allowed.includes(key)) url.searchParams.delete(key);
  if (url.hash && !/^#drive-\d+$/.test(url.hash)) url.hash = "";
  return `${url.pathname}${url.search}${url.hash}`;
}
