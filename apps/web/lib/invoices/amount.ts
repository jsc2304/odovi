/** Format valid cents as text; invalid input reaches the server unchanged. */
export function normalizeInvoiceAmount(raw: string | null): string | null {
  const value = raw?.trim().replace(",", ".") ?? "";
  if (!value) return null;
  const match = /^(\d{1,8})(?:\.(\d{1,2}))?$/.exec(value);
  return match ? `${match[1]}.${(match[2] ?? "").padEnd(2, "0")}` : value;
}
