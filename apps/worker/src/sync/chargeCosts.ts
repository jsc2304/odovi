import { and, eq, isNotNull, isNull, or } from "drizzle-orm";
import { chargeSessions, places, type Db } from "@odovi/db";
import { computeAutoChargeCost } from "@odovi/core";

export interface ChargeCostsResult {
  updated: number;
}

/**
 * Automatische Ladekosten: Sessions ohne Kostenwert (cost IS NULL) oder mit
 * cost_source='auto' an Orten mit gesetztem electricity_price_per_kwh bekommen
 * cost = energy_added_kwh * Preis (cost_source='auto'). 'manual'/'synced'
 * Werte werden nie angefasst (user-owned-Konvention, siehe schema.ts).
 */
export async function applyAutoChargeCosts(
  db: Db,
): Promise<ChargeCostsResult> {
  let updated = 0;

  const staleAutoSessions = await db
    .select({
      id: chargeSessions.id,
    })
    .from(chargeSessions)
    .leftJoin(places, eq(chargeSessions.placeId, places.id))
    .where(
      and(
        eq(chargeSessions.costSource, "auto"),
        or(
          isNull(chargeSessions.placeId),
          isNull(places.electricityPricePerKwh),
          isNull(places.electricityPriceCurrency),
        ),
      ),
    );

  for (const row of staleAutoSessions) {
    await db
      .update(chargeSessions)
      .set({ cost: null, currency: null, costSource: null, updatedAt: new Date() })
      .where(and(eq(chargeSessions.id, row.id), eq(chargeSessions.costSource, "auto")));
    updated++;
  }

  const candidates = await db
    .select({
      id: chargeSessions.id,
      energyAddedKwh: chargeSessions.energyAddedKwh,
      cost: chargeSessions.cost,
      currency: chargeSessions.currency,
      costSource: chargeSessions.costSource,
      pricePerKwh: places.electricityPricePerKwh,
      priceCurrency: places.electricityPriceCurrency,
    })
    .from(chargeSessions)
    .innerJoin(places, eq(chargeSessions.placeId, places.id))
    .where(
      and(
        isNotNull(places.electricityPricePerKwh),
        isNotNull(places.electricityPriceCurrency),
        or(
          and(isNull(chargeSessions.cost), isNull(chargeSessions.costSource)),
          eq(chargeSessions.costSource, "auto"),
        ),
      ),
    );

  for (const row of candidates) {
    if (row.energyAddedKwh == null) continue;
    const price = Number(row.pricePerKwh);
    if (!Number.isFinite(price)) continue;

    const newCost = computeAutoChargeCost(row.energyAddedKwh, price).toFixed(2);
    const newCurrency = row.priceCurrency!;

    if (row.cost === newCost && row.currency === newCurrency && row.costSource === "auto") {
      continue; // idempotent — bereits aktuell
    }

    await db
      .update(chargeSessions)
      .set({ cost: newCost, currency: newCurrency, costSource: "auto", updatedAt: new Date() })
      .where(and(eq(chargeSessions.id, row.id), or(
        and(isNull(chargeSessions.cost), isNull(chargeSessions.costSource)),
        eq(chargeSessions.costSource, "auto"),
      )));
    updated++;
  }

  return { updated };
}
