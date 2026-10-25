export interface ChargingEconomicsInput {
  energyAddedKwh: number | null;
  energyUsedKwh: number | null;
  cost: string | null;
  currency: string | null;
  chargerType: "ac" | "dc" | null;
  placeId: number | null;
  placeName: string | null;
  address: string | null;
}

export interface ChargingCostSummary {
  currency: string | null;
  total: string;
  sessionCount: number;
  added: { sessionCount: number; energyKwh: number; cost: string; perKwh: number | null };
  drawn: { sessionCount: number; energyKwh: number; cost: string; perKwh: number | null };
}

export interface ChargingEconomicsSummary {
  sessionCount: number;
  addedKwh: number;
  addedCount: number;
  drawnKwh: number;
  drawnCount: number;
  pairedCount: number;
  inconsistentCount: number;
  pairedAddedKwh: number;
  pairedDrawnKwh: number;
  efficiency: number | null;
  lossKwh: number | null;
  pricedCount: number;
  costs: ChargingCostSummary[];
}

export interface ChargingEconomics {
  total: ChargingEconomicsSummary;
  sources: Array<{ key: "ac" | "dc" | "unknown"; summary: ChargingEconomicsSummary }>;
  locations: Array<{ key: string; name: string | null; summary: ChargingEconomicsSummary }>;
}

function nonnegative(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value >= 0;
}

// Database money has scale 2; preserve that precision without floating-point addition.
function cents(value: string | null): bigint | null {
  if (value === null || !/^\+?\d+(?:\.\d{1,2})?$/.test(value.trim())) return null;
  const [whole, fraction = ""] = value.trim().replace(/^\+/, "").split(".");
  return BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, "0"));
}

function decimal(value: bigint): string {
  return `${value / 100n}.${(value % 100n).toString().padStart(2, "0")}`;
}

function summarize(sessions: ChargingEconomicsInput[]): ChargingEconomicsSummary {
  const result: ChargingEconomicsSummary = {
    sessionCount: sessions.length, addedKwh: 0, addedCount: 0, drawnKwh: 0, drawnCount: 0,
    pairedCount: 0, inconsistentCount: 0, pairedAddedKwh: 0, pairedDrawnKwh: 0,
    efficiency: null, lossKwh: null, pricedCount: 0, costs: [],
  };
  const money = new Map<string | null, {
    cents: bigint; count: number;
    added: { cents: bigint; count: number; energy: number };
    drawn: { cents: bigint; count: number; energy: number };
  }>();
  for (const session of sessions) {
    const added = nonnegative(session.energyAddedKwh) ? session.energyAddedKwh : null;
    const drawn = nonnegative(session.energyUsedKwh) ? session.energyUsedKwh : null;
    if (added !== null) { result.addedKwh += added; result.addedCount++; }
    if (drawn !== null) { result.drawnKwh += drawn; result.drawnCount++; }
    if (added !== null && drawn !== null && drawn > 0) {
      if (added <= drawn) {
        result.pairedCount++;
        result.pairedAddedKwh += added;
        result.pairedDrawnKwh += drawn;
      } else result.inconsistentCount++;
    }
    const cost = cents(session.cost);
    if (cost === null) continue;
    result.pricedCount++;
    const code = session.currency?.trim().toUpperCase();
    const currency = code && /^[A-Z]{3}$/.test(code) ? code : null;
    const group = money.get(currency) ?? {
      cents: 0n, count: 0, added: { cents: 0n, count: 0, energy: 0 }, drawn: { cents: 0n, count: 0, energy: 0 },
    };
    group.cents += cost; group.count++;
    if (added !== null && added > 0) { group.added.cents += cost; group.added.energy += added; group.added.count++; }
    if (drawn !== null && drawn > 0) { group.drawn.cents += cost; group.drawn.energy += drawn; group.drawn.count++; }
    money.set(currency, group);
  }
  if (result.pairedCount > 0) {
    result.efficiency = result.pairedAddedKwh / result.pairedDrawnKwh;
    result.lossKwh = result.pairedDrawnKwh - result.pairedAddedKwh;
  }
  result.costs = [...money].sort(([a], [b]) => a === b ? 0 : a === null ? 1 : b === null ? -1 : a.localeCompare(b)).map(([currency, group]) => {
    const matched = (part: typeof group.added) => {
      const ratio = Number(part.cents) / 100 / part.energy;
      return { sessionCount: part.count, energyKwh: part.energy, cost: decimal(part.cents), perKwh: currency !== null && part.energy > 0 && Number.isFinite(ratio) ? ratio : null };
    };
    return { currency, total: decimal(group.cents), sessionCount: group.count, added: matched(group.added), drawn: matched(group.drawn) };
  });
  return result;
}

/** Input is one vehicle's completed sessions within the selected local calendar month. */
export function summarizeChargingEconomics(sessions: ChargingEconomicsInput[]): ChargingEconomics {
  const sources = new Map<"ac" | "dc" | "unknown", ChargingEconomicsInput[]>();
  const locations = new Map<string, { name: string | null; sessions: ChargingEconomicsInput[] }>();
  for (const session of sessions) {
    const source = session.chargerType ?? "unknown";
    const group = sources.get(source) ?? [];
    group.push(session); sources.set(source, group);
    const address = session.address?.trim().replace(/\s+/g, " ") || null;
    const key = session.placeId !== null ? `place:${session.placeId}` : address ? `address:${address.toLowerCase()}` : "unknown";
    const location = locations.get(key) ?? { name: session.placeName?.trim() || address, sessions: [] };
    location.sessions.push(session); locations.set(key, location);
  }
  return {
    total: summarize(sessions),
    sources: (["ac", "dc", "unknown"] as const).filter((key) => sources.has(key)).map((key) => ({ key, summary: summarize(sources.get(key)!) })),
    locations: [...locations].sort(([a], [b]) => a.localeCompare(b)).map(([key, group]) => ({ key, name: group.name, summary: summarize(group.sessions) })),
  };
}
