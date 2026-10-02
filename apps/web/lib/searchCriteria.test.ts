import { describe, expect, it } from "vitest";
import { parseSearchCriteria } from "./searchCriteria";
import { archiveReturnTo } from "./archiveContext";

describe("archive request context", () => {
  it("searches each explicit valid type and retains the bare entry state", () => {
    expect(parseSearchCriteria({}).shouldSearch).toBe(false);
    for (const type of ["drives", "charges", "all"]) expect(parseSearchCriteria({ type })).toMatchObject({ type, shouldSearch: true });
    expect(parseSearchCriteria({ type: "other", from: "2026-02-30" })).toMatchObject({ type: "drives", shouldSearch: false });
    expect(parseSearchCriteria({ q: " home ", from: "2026-10-02", classification: "business,invalid,business" }))
      .toMatchObject({ q: "home", from: "2026-10-02", classifications: ["business"], shouldSearch: true });
  });
  it("keeps local list filters and position and rejects external or invalid returns", () => {
    const fallback = "/day/2026-10-02?vehicle=1";
    expect(archiveReturnTo("/search?q=Home&type=charges&vehicle=2#drive-42", fallback)).toBe("/search?q=Home&type=charges&vehicle=2#drive-42");
    expect(archiveReturnTo("/day/2026-10-01?vehicle=2&month=2026-09#drive-2", fallback)).toContain("month=2026-09");
    for (const raw of ["https://example.com", "//example.com", "/\\example.com", "/login", "/day/2026-02-30"]) expect(archiveReturnTo(raw, fallback)).toBe(fallback);
    expect(archiveReturnTo("/search?redirect=evil#other", fallback)).toBe("/search");
  });
});
