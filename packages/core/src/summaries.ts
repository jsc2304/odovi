export interface DriveEnergySample {
  distanceKm: number | null;
  consumedEnergyKwh: number | null;
  energyIsEstimated: boolean;
}

export interface DriveEnergySummary {
  totalDistanceKm: number;
  totalEnergyKwh: number;
  usableDistanceKm: number;
  usableEnergyKwh: number;
  avgConsumptionWhKm: number | null;
  anyEstimated: boolean;
  hasIncompleteEnergy: boolean;
}

/**
 * Builds distance and energy totals without turning missing values into zero.
 * Average consumption only uses drives that have both a positive distance and
 * a finite energy value, so short/long drives are weighted by their distance.
 */
export function summarizeDriveEnergy(
  drives: DriveEnergySample[],
): DriveEnergySummary {
  let totalDistanceKm = 0;
  let totalEnergyKwh = 0;
  let usableDistanceKm = 0;
  let usableEnergyKwh = 0;
  let anyEstimated = false;
  let hasIncompleteEnergy = false;

  for (const drive of drives) {
    const distance = drive.distanceKm;
    const energy = drive.consumedEnergyKwh;
    const hasDistance =
      distance != null && Number.isFinite(distance) && distance > 0;
    const hasEnergy = energy != null && Number.isFinite(energy);

    if (hasDistance) totalDistanceKm += distance;
    if (hasEnergy) totalEnergyKwh += energy;
    if (hasEnergy && drive.energyIsEstimated) anyEstimated = true;

    if (hasDistance && hasEnergy) {
      usableDistanceKm += distance;
      usableEnergyKwh += energy;
    } else if (hasDistance) {
      hasIncompleteEnergy = true;
    }
  }

  return {
    totalDistanceKm,
    totalEnergyKwh,
    usableDistanceKm,
    usableEnergyKwh,
    avgConsumptionWhKm:
      usableDistanceKm > 0
        ? (usableEnergyKwh * 1000) / usableDistanceKm
        : null,
    anyEstimated,
    hasIncompleteEnergy,
  };
}

export interface ChargeSummarySample {
  energyAddedKwh: number | null;
  durationSeconds: number | null;
  cost: string | number | null;
  currency: string | null;
  chargerType: "ac" | "dc" | null;
}

export interface ChargeSummary {
  sessionCount: number;
  totalEnergyKwh: number;
  avgEnergyPerSessionKwh: number | null;
  effectivePowerKw: number | null;
  acCount: number;
  dcCount: number;
  acEnergyShare: number | null;
  dcEnergyShare: number | null;
  totalCost: number | null;
  currency: string | null;
  costPerKwh: number | null;
  costCoverage: number | null;
  mixedCurrencies: boolean;
}

/**
 * Null-safe charging summary. Cost-per-kWh is only emitted for a single known
 * currency, while coverage remains useful even when currencies are mixed.
 */
export function summarizeCharges(
  sessions: ChargeSummarySample[],
): ChargeSummary {
  let totalEnergyKwh = 0;
  let energySessionCount = 0;
  let durationEnergyKwh = 0;
  let durationSeconds = 0;
  let acCount = 0;
  let dcCount = 0;
  let acEnergyKwh = 0;
  let dcEnergyKwh = 0;
  let knownCostEnergyKwh = 0;
  let pairedCost = 0;
  let allCost = 0;
  const currencies = new Set<string>();

  for (const session of sessions) {
    const energy = session.energyAddedKwh;
    const hasEnergy = energy != null && Number.isFinite(energy) && energy > 0;
    const duration = session.durationSeconds;
    const cost = session.cost == null ? null : Number(session.cost);
    const hasCost = cost != null && Number.isFinite(cost);

    if (session.chargerType === "ac") acCount += 1;
    if (session.chargerType === "dc") dcCount += 1;

    if (hasEnergy) {
      totalEnergyKwh += energy;
      energySessionCount += 1;
      if (session.chargerType === "ac") acEnergyKwh += energy;
      if (session.chargerType === "dc") dcEnergyKwh += energy;

      if (duration != null && Number.isFinite(duration) && duration > 0) {
        durationEnergyKwh += energy;
        durationSeconds += duration;
      }
      if (hasCost) {
        knownCostEnergyKwh += energy;
        pairedCost += cost;
      }
    }

    if (hasCost) {
      allCost += cost;
      currencies.add(session.currency ?? "");
    }
  }

  const currencyValues = [...currencies];
  const mixedCurrencies = currencyValues.length > 1;
  const singleCurrency =
    currencyValues.length === 1 && currencyValues[0] !== ""
      ? currencyValues[0]!
      : null;
  return {
    sessionCount: sessions.length,
    totalEnergyKwh,
    avgEnergyPerSessionKwh:
      energySessionCount > 0 ? totalEnergyKwh / energySessionCount : null,
    effectivePowerKw:
      durationSeconds > 0
        ? durationEnergyKwh / (durationSeconds / 3600)
        : null,
    acCount,
    dcCount,
    acEnergyShare: totalEnergyKwh > 0 ? acEnergyKwh / totalEnergyKwh : null,
    dcEnergyShare: totalEnergyKwh > 0 ? dcEnergyKwh / totalEnergyKwh : null,
    totalCost: singleCurrency != null ? allCost : null,
    currency: singleCurrency,
    costPerKwh:
      singleCurrency != null && knownCostEnergyKwh > 0
        ? pairedCost / knownCostEnergyKwh
        : null,
    costCoverage:
      totalEnergyKwh > 0 ? knownCostEnergyKwh / totalEnergyKwh : null,
    mixedCurrencies,
  };
}
