/** Maximum interpolation interval. Longer gaps do not describe an observed curve. */
export const DC_CHARGE_MAX_GAP_MS = 2 * 60_000;
export const DC_CHARGE_MIN_SLOW_PEERS = 3;
export const DC_CHARGE_TEMPERATURE_RANGE_C = 5;

export type DcChargePoint = {
  ts: number;
  powerKw: number | null;
  soc: number | null;
  outsideTemp: number | null;
};

export type DcChargeSessionInput = {
  id: number;
  startTime: number;
  endTime: number;
  placeId: number | null;
  placeName: string | null;
  address: string | null;
  maxPowerKw: number | null;
  outsideTempAvg: number | null;
  points: DcChargePoint[];
};

export type DcChargeTimingUnavailableReason =
  | "missing-points"
  | "partial-session"
  | "data-gap"
  | "soc-regression"
  | "conflicting-points";

export type DcChargeCurvePoint = {
  ts: number;
  elapsedMinutes: number;
  soc: number;
  powerKw: number;
};

export type DcChargeSessionAnalysis = Omit<DcChargeSessionInput, "points" | "maxPowerKw"> & {
  tenToEighty: {
    minutes: number | null;
    reason: DcChargeTimingUnavailableReason | null;
  };
  /** Trapezoidal mean over observed power intervals across the whole session. */
  averagePowerKw: number | null;
  /** Highest valid recorded summary or observed sample, never a median of peaks. */
  peakPowerKw: number | null;
  observedPowerMinutes: number;
  powerCoveragePercent: number;
  curveSegments: DcChargeCurvePoint[][];
  slowHint: {
    peerCount: number;
    peerMedianMinutes: number;
    slowerMinutes: number;
    slowerPercent: number;
    temperatureMatched: boolean;
  } | null;
};

export type DcChargeLocationAnalysis = {
  key: string;
  placeName: string | null;
  address: string | null;
  sessionCount: number;
  timingSessionCount: number;
  medianTenToEightyMinutes: number | null;
  rankingEligible: boolean;
};

export type DcChargeAnalysis = {
  sessions: DcChargeSessionAnalysis[];
  summary: {
    sessionCount: number;
    timingSessionCount: number;
    medianTenToEightyMinutes: number | null;
    medianAveragePowerKw: number | null;
    peakPowerKw: number | null;
  };
  locations: DcChargeLocationAnalysis[];
};

type NormalizedPoint = DcChargePoint & {
  socConflict: boolean;
  powerConflict: boolean;
  observedPeakPowerKw: number | null;
};

function finite(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}

function power(value: number | null): number | null {
  return finite(value) && value >= 0 ? value : null;
}

function soc(value: number | null): number | null {
  return finite(value) && value >= 0 && value <= 100 ? value : null;
}

function median(values: Array<number | null>): number | null {
  const sorted = values.filter(finite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : sorted[middle - 1]! / 2 + sorted[middle]! / 2;
}

function maximum(values: Array<number | null>): number | null {
  let result: number | null = null;
  for (const value of values) {
    if (finite(value) && (result === null || value > result)) result = value;
  }
  return result;
}

function mergeValues(values: Array<number | null>): { value: number | null; conflict: boolean } {
  const distinct = new Set(values.filter(finite));
  return {
    value: distinct.size === 1 ? distinct.values().next().value! : null,
    conflict: distinct.size > 1,
  };
}

/** Sort without mutating input; merge agreeing duplicates, never average conflicts away. */
function normalizePoints(session: DcChargeSessionInput): NormalizedPoint[] {
  if (!Number.isFinite(session.startTime) || !Number.isFinite(session.endTime)
    || session.endTime <= session.startTime || !Number.isFinite(session.endTime - session.startTime)) return [];
  const sorted = session.points
    .filter((point) => Number.isFinite(point.ts)
      && point.ts >= session.startTime && point.ts <= session.endTime)
    .slice()
    .sort((a, b) => a.ts - b.ts);
  const result: NormalizedPoint[] = [];
  for (let index = 0; index < sorted.length;) {
    const ts = sorted[index]!.ts;
    const group: DcChargePoint[] = [];
    while (index < sorted.length && sorted[index]!.ts === ts) group.push(sorted[index++]!);
    const mergedSoc = mergeValues(group.map((point) => soc(point.soc)));
    const mergedPower = mergeValues(group.map((point) => power(point.powerKw)));
    result.push({
      ts,
      soc: mergedSoc.value,
      powerKw: mergedPower.value,
      outsideTemp: mergeValues(group.map((point) => point.outsideTemp)).value,
      socConflict: mergedSoc.conflict,
      powerConflict: mergedPower.conflict,
      observedPeakPowerKw: maximum(group.map((point) => power(point.powerKw))),
    });
  }
  return result;
}

/** Timestamp where a monotonic, gap-free sequence first reaches a threshold. */
function crossingTime(points: NormalizedPoint[], threshold: number): number | null {
  for (let index = 0; index < points.length; index++) {
    const point = points[index]!;
    if (point.soc === threshold) return point.ts;
    const previous = points[index - 1];
    if (previous && previous.soc! < threshold && point.soc! > threshold) {
      return previous.ts + (point.ts - previous.ts)
        * (threshold - previous.soc!) / (point.soc! - previous.soc!);
    }
  }
  return null;
}

function timing(points: NormalizedPoint[]): DcChargeSessionAnalysis["tenToEighty"] {
  const valid = points.filter((point) => point.soc !== null);
  if (valid.length < 2) return { minutes: null, reason: "missing-points" };
  const firstLow = points.findIndex((point) => point.soc !== null && point.soc <= 10);
  const firstHigh = points.findIndex((point, index) => index > firstLow && point.soc !== null && point.soc >= 80);
  if (firstLow < 0 || firstHigh < 0) return { minutes: null, reason: "partial-session" };

  // Only the observed window matters: gaps before an exact 10% sample and after
  // reaching 80% cannot change its duration. A drop after the first 10% crossing
  // invalidates this attempt instead of silently restarting a shorter window.
  const firstCrossing = points.findIndex((point, index) => index >= firstLow && point.soc !== null && point.soc >= 10);
  let startIndex = firstCrossing;
  if (points[firstCrossing]!.soc !== 10) {
    // Take the last observed point below 10%; earlier gaps/regressions below
    // the measured window do not affect this threshold's interpolation.
    startIndex--;
    while (points[startIndex]!.soc === null && startIndex > firstLow) startIndex--;
  }
  const window = points.slice(startIndex, firstHigh + 1);
  for (let index = 0; index < window.length; index++) {
    const point = window[index]!;
    if (point.socConflict) return { minutes: null, reason: "conflicting-points" };
    if (point.soc === null) return { minutes: null, reason: "data-gap" };
    const previous = window[index - 1];
    if (!previous) continue;
    if (point.ts - previous.ts > DC_CHARGE_MAX_GAP_MS) return { minutes: null, reason: "data-gap" };
    if (point.soc < previous.soc!) return { minutes: null, reason: "soc-regression" };
  }
  const start = crossingTime(window, 10);
  const end = crossingTime(window, 80);
  return start !== null && end !== null && end > start
    ? { minutes: (end - start) / 60_000, reason: null }
    : { minutes: null, reason: "partial-session" };
}

function curves(points: NormalizedPoint[], startTime: number): DcChargeCurvePoint[][] {
  const result: DcChargeCurvePoint[][] = [];
  let segment: DcChargeCurvePoint[] = [];
  const finish = () => {
    if (segment.length >= 2) result.push(segment);
    segment = [];
  };
  for (const point of points) {
    if (point.soc === null || point.powerKw === null) {
      finish();
      continue;
    }
    const previous = segment[segment.length - 1];
    if (previous && (point.ts - previous.ts > DC_CHARGE_MAX_GAP_MS || point.soc < previous.soc)) finish();
    segment.push({
      ts: point.ts,
      elapsedMinutes: (point.ts - startTime) / 60_000,
      soc: point.soc,
      powerKw: point.powerKw,
    });
  }
  finish();
  return result;
}

function analyzeSession(session: DcChargeSessionInput): DcChargeSessionAnalysis {
  const points = normalizePoints(session);
  let averagePowerKw = 0;
  let observedPowerMs = 0;
  for (let index = 1; index < points.length; index++) {
    const previous = points[index - 1]!;
    const point = points[index]!;
    const duration = point.ts - previous.ts;
    if (previous.powerKw === null || point.powerKw === null || duration > DC_CHARGE_MAX_GAP_MS) continue;
    const intervalMean = previous.powerKw / 2 + point.powerKw / 2;
    averagePowerKw += (intervalMean - averagePowerKw) * (duration / (observedPowerMs + duration));
    observedPowerMs += duration;
  }
  const sessionDuration = session.endTime - session.startTime;
  return {
    id: session.id,
    startTime: session.startTime,
    endTime: session.endTime,
    placeId: session.placeId,
    placeName: session.placeName,
    address: session.address,
    outsideTempAvg: finite(session.outsideTempAvg) ? session.outsideTempAvg : null,
    tenToEighty: timing(points),
    averagePowerKw: observedPowerMs > 0 ? averagePowerKw : null,
    peakPowerKw: maximum([power(session.maxPowerKw), ...points.map((point) => point.observedPeakPowerKw)]),
    observedPowerMinutes: observedPowerMs / 60_000,
    powerCoveragePercent: Number.isFinite(sessionDuration) && sessionDuration > 0
      ? Math.min(100, observedPowerMs / sessionDuration * 100) : 0,
    curveSegments: curves(points, session.startTime),
    slowHint: null,
  };
}

function slowHint(session: DcChargeSessionAnalysis, sessions: DcChargeSessionAnalysis[]): DcChargeSessionAnalysis["slowHint"] {
  if (session.tenToEighty.minutes === null) return null;
  const peers = sessions.filter((peer) => peer.id !== session.id && peer.tenToEighty.minutes !== null);
  const temperaturePeers = session.outsideTempAvg === null ? [] : peers.filter((peer) => peer.outsideTempAvg !== null
    && Math.abs(peer.outsideTempAvg - session.outsideTempAvg!) <= DC_CHARGE_TEMPERATURE_RANGE_C);
  const temperatureMatched = temperaturePeers.length >= DC_CHARGE_MIN_SLOW_PEERS;
  const comparable = temperatureMatched ? temperaturePeers : peers;
  if (comparable.length < DC_CHARGE_MIN_SLOW_PEERS) return null;
  const peerMedianMinutes = median(comparable.map((peer) => peer.tenToEighty.minutes))!;
  const slowerMinutes = session.tenToEighty.minutes - peerMedianMinutes;
  const slowerPercent = slowerMinutes / peerMedianMinutes * 100;
  if (slowerMinutes < 5 || slowerPercent < 25) return null;
  return { peerCount: comparable.length, peerMedianMinutes, slowerMinutes, slowerPercent, temperatureMatched };
}

function locations(sessions: DcChargeSessionAnalysis[]): DcChargeLocationAnalysis[] {
  const groups = new Map<string, DcChargeSessionAnalysis[]>();
  for (const session of sessions) {
    const address = session.address?.trim().replace(/\s+/g, " ") || null;
    const key = session.placeId !== null ? `place:${session.placeId}` : address ? `address:${address.toLowerCase()}` : "unknown";
    const group = groups.get(key) ?? [];
    group.push(session);
    groups.set(key, group);
  }
  return [...groups.entries()].map(([key, group]) => {
    const durations = group.map((session) => session.tenToEighty.minutes).filter(finite);
    return {
      key,
      placeName: group.find((session) => session.placeName)?.placeName ?? null,
      address: group.find((session) => session.address)?.address ?? null,
      sessionCount: group.length,
      timingSessionCount: durations.length,
      medianTenToEightyMinutes: median(durations),
      rankingEligible: key !== "unknown" && durations.length >= 2,
    };
  }).sort((a, b) => Number(b.rankingEligible) - Number(a.rankingEligible)
    || (a.rankingEligible ? a.medianTenToEightyMinutes! - b.medianTenToEightyMinutes! : 0)
    || b.timingSessionCount - a.timingSessionCount
    || a.key.localeCompare(b.key));
}

/** Analyze completed DC sessions for one vehicle, in the caller's selected order.
 *
 * Selection and permissions belong to the caller. No partial 10–80 extrapolation,
 * battery-temperature estimates, vehicle requests or provider calls are made.
 * Slow hints compare valid 10–80 windows, require three other sessions and both
 * a 25% and five-minute difference. Outside-temperature matching is optional,
 * requires three peers within ±5°C and is context, never a causal explanation.
 */
export function analyzeDcCharges(inputs: DcChargeSessionInput[]): DcChargeAnalysis {
  const sessions = inputs.map(analyzeSession);
  for (const session of sessions) session.slowHint = slowHint(session, sessions);
  return {
    sessions,
    summary: {
      sessionCount: sessions.length,
      timingSessionCount: sessions.filter((session) => session.tenToEighty.minutes !== null).length,
      medianTenToEightyMinutes: median(sessions.map((session) => session.tenToEighty.minutes)),
      medianAveragePowerKw: median(sessions.map((session) => session.averagePowerKw)),
      peakPowerKw: maximum(sessions.map((session) => session.peakPowerKw)),
    },
    locations: locations(sessions),
  };
}
