/** Independent TeslaMate BMS range observations; no energy/efficiency-derived capacity. */
export interface BatteryRangeCharge {
  startTime: number;
  endTime: number | null;
  endRatedRangeKm: number | null;
  endSoc: number | null;
  energyAddedKwh: number | null;
}

export interface BatteryRangeMonth {
  month: string;
  medianFullRangeKm: number;
  sampleCount: number;
}

export interface BatteryRangeTrend {
  months: BatteryRangeMonth[];
  firstDataAt: number | null;
  firstObservationAt: number | null;
  lastObservationAt: number | null;
  completedChargeCount: number;
  observationCount: number;
  rejectedCount: number;
  baseline: BatteryRangeMonth | null;
  latest: BatteryRangeMonth | null;
  changeKm: number | null;
  changePercent: number | null;
}

/** At least three observations in each distinct month before displaying a comparison. */
const MIN_COMPARISON_SAMPLES = 3;

export function buildBatteryRangeTrend(
  charges: readonly BatteryRangeCharge[],
  timeZone: string,
  now = Date.now(),
): BatteryRangeTrend {
  const monthFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit",
  });
  const samples = new Map<string, number[]>();
  let firstDataAt: number | null = null;
  let firstObservationAt: number | null = null;
  let lastObservationAt: number | null = null;
  let completedChargeCount = 0;
  let observationCount = 0;

  for (const charge of charges) {
    const { startTime, endTime, endSoc, endRatedRangeKm, energyAddedKwh } = charge;
    if (!Number.isFinite(startTime) || endTime == null || !Number.isFinite(endTime) ||
        endTime <= startTime || endTime > now) continue;
    completedChargeCount++;
    firstDataAt = firstDataAt == null ? endTime : Math.min(firstDataAt, endTime);
    if (endSoc == null || !Number.isInteger(endSoc) || endSoc < 20 || endSoc > 100 ||
        endRatedRangeKm == null || !Number.isFinite(endRatedRangeKm) || endRatedRangeKm <= 0 ||
        energyAddedKwh == null || !Number.isFinite(energyAddedKwh) || energyAddedKwh <= 5) continue;
    const fullRangeKm = endRatedRangeKm * 100 / endSoc;
    if (!Number.isFinite(fullRangeKm)) continue;
    const parts = monthFormatter.formatToParts(endTime);
    const month = `${parts.find((part) => part.type === "year")!.value}-${parts.find((part) => part.type === "month")!.value}`;
    const values = samples.get(month) ?? [];
    values.push(fullRangeKm);
    samples.set(month, values);
    observationCount++;
    firstObservationAt = firstObservationAt == null ? endTime : Math.min(firstObservationAt, endTime);
    lastObservationAt = lastObservationAt == null ? endTime : Math.max(lastObservationAt, endTime);
  }

  const months = [...samples].sort(([a], [b]) => a.localeCompare(b)).map(([month, values]) => {
    values.sort((a, b) => a - b);
    const middle = Math.floor(values.length / 2);
    const median = values.length % 2 === 0
      ? values[middle - 1]! / 2 + values[middle]! / 2
      : values[middle]!;
    return { month, medianFullRangeKm: median, sampleCount: values.length };
  });
  const baseline = months[0] ?? null;
  const latest = months.at(-1) ?? null;
  const comparable = baseline != null && latest != null && baseline.month !== latest.month &&
    baseline.sampleCount >= MIN_COMPARISON_SAMPLES && latest.sampleCount >= MIN_COMPARISON_SAMPLES;
  const changeKm = comparable ? latest.medianFullRangeKm - baseline.medianFullRangeKm : null;
  return {
    months, firstDataAt, firstObservationAt, lastObservationAt,
    completedChargeCount, observationCount, rejectedCount: completedChargeCount - observationCount,
    baseline, latest, changeKm,
    changePercent: changeKm == null ? null : changeKm / baseline!.medianFullRangeKm * 100,
  };
}
