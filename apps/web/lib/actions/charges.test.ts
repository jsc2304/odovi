import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  current: {} as Record<string, unknown>,
  set: vi.fn(),
  audit: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
vi.mock("../auth/session", () => ({ validateSession: async () => ({ username: "tester" }) }));
vi.mock("../db", () => ({
  db: {
    select: () => {
      const query = {
        from: () => query,
        leftJoin: () => query,
        where: () => query,
        limit: async () => [mocks.current],
      };
      return query;
    },
    transaction: async (run: (tx: unknown) => Promise<void>) => run({
      select: () => {
        const query = { from: () => query, leftJoin: () => query, where: () => query,
          limit: () => query, for: async () => [mocks.current] };
        return query;
      },
      update: () => ({ set: (patch: unknown) => {
        mocks.set(patch);
        return { where: async () => undefined };
      } }),
      insert: () => ({ values: mocks.audit }),
    }),
  },
}));

import { updateChargeAnnotations } from "./charges";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.current = {
    cost: "0.46", currency: "EUR", costSource: "manual", notes: null,
    energyAddedKwh: 30, pricePerKwh: "0.46", priceCurrency: "CHF",
  };
});

async function save(cost = "", currency = "EUR", notes = "") {
  const form = new FormData();
  form.set("chargeSessionId", "1");
  form.set("cost", cost);
  form.set("currency", currency);
  form.set("notes", notes);
  expect(await updateChargeAnnotations({ ok: false }, form)).toMatchObject({ ok: true });
}

it("uses the place tariff immediately when a manual cost is cleared", async () => {
  await save();
  expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({
    cost: "13.80", currency: "CHF", costSource: "auto",
  }));
  expect(mocks.audit).toHaveBeenCalledWith(expect.arrayContaining([
    expect.objectContaining({ field: "cost_source", oldValue: "manual", newValue: "auto" }),
  ]));
});

it("repairs an already empty manual cost on saving again", async () => {
  mocks.current.cost = null;
  await save();
  expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({ cost: "13.80", costSource: "auto" }));
});

it.each([
  { pricePerKwh: null },
  { priceCurrency: null },
  { energyAddedKwh: null },
])("clears the manual marker without a usable tariff or energy: %j", async (missing) => {
  Object.assign(mocks.current, missing);
  await save();
  expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({ cost: null, currency: null, costSource: null }));
});

it("keeps an explicit zero as a manual cost", async () => {
  await save("0");
  expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({ cost: "0.00" }));
  expect(mocks.set.mock.calls[0][0].costSource).not.toBe("auto");
});

it.each(["auto", "synced"])("preserves %s provenance for notes-only edits", async (source) => {
  Object.assign(mocks.current, { cost: "13.80", currency: "CHF", costSource: source });
  await save("13,80", "CHF", "Updated note");
  expect(mocks.set).toHaveBeenCalledWith({ notes: "Updated note", updatedAt: expect.any(Date) });
});
