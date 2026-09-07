import type { Classification } from "../reports/types.js";
import { summarizeDriveEnergy } from "../summaries.js";

export type YearlyClassification = Classification;
export type YearlyClassificationFilter = YearlyClassification | "all";
export const YEARLY_CLASSIFICATIONS: readonly YearlyClassification[] = ["private", "business", "commute", "unclassified"];

export type YearlyDriveInput = {
  id: number;
  startTime: number;
  endTime: number | null;
  classification: YearlyClassification;
  distanceKm: number | null;
  durationSeconds: number | null;
  consumedEnergyKwh: number | null;
  energyIsEstimated: boolean;
  endPlaceId: number | null;
  endLat: number | null;
  endLon: number | null;
  endAddress: string | null;
};

export type YearlyPlaceInput = {
  id: number;
  name: string;
  type: string;
  lat: number | null;
  lon: number | null;
};

export type YearlyChargeInput = {
  id: number;
  startTime: number;
  endTime: number | null;
  energyAddedKwh: number | null;
  maxPowerKw: number | null;
  chargerType: "ac" | "dc" | null;
  cost: string | null;
  currency: string | null;
  placeId: number | null;
  address: string | null;
};

export type YearlyDriveTotals = {
  driveCount: number;
  totalDistanceKm: number;
  knownDistanceDriveCount: number;
  missingDistanceDriveCount: number;
  totalDurationSeconds: number;
  knownDurationDriveCount: number;
  missingDurationDriveCount: number;
  totalEnergyKwh: number;
  knownEnergyDriveCount: number;
  missingEnergyDriveCount: number;
  estimatedEnergyDriveCount: number;
  avgConsumptionWhKm: number | null;
};

export type YearlyDestination = {
  key: string;
  placeId: number | null;
  name: string | null;
  address: string | null;
  lat: number | null;
  lon: number | null;
  visitCount: number;
  isHome: boolean;
  firstVisitedAt: number;
  lastVisitedAt: number;
};

export type YearlyChargingSummary = {
  sessionCount: number;
  acCount: number;
  dcCount: number;
  unknownTypeCount: number;
  energyAddedKwh: number;
  knownEnergySessionCount: number;
  missingEnergySessionCount: number;
  peakDcPowerKw: number | null;
  /** Decimal amounts are summed as integer cents; currencies are never mixed. */
  costs: { currency: string | null; total: string; sessionCount: number }[];
  knownCostSessionCount: number;
  missingCostSessionCount: number;
  favoriteLocation: {
    key: string;
    placeId: number | null;
    name: string | null;
    address: string | null;
    sessionCount: number;
  } | null;
};

export type YearlyInsights = {
  year: number;
  timeZone: string;
  classification: YearlyClassificationFilter;
  totals: YearlyDriveTotals;
  classifications: {
    classification: YearlyClassification;
    driveCount: number;
    distanceKm: number;
    knownDistanceDriveCount: number;
    missingDistanceDriveCount: number;
  }[];
  months: {
    month: number;
    driveCount: number;
    distanceKm: number;
    durationSeconds: number;
    energyKwh: number;
    knownDistanceDriveCount: number;
    missingDistanceDriveCount: number;
    knownEnergyDriveCount: number;
    missingEnergyDriveCount: number;
    estimatedEnergyDriveCount: number;
  }[];
  destinations: YearlyDestination[];
  destinationCoverage: {
    groupedDriveCount: number;
    mappedDriveCount: number;
    missingDestinationDriveCount: number;
  };
  favoriteDestination: YearlyDestination | null;
  longestDrive: {
    id: number;
    startTime: number;
    distanceKm: number;
    durationSeconds: number | null;
    destinationKey: string | null;
  } | null;
  homeReference: { id: number; name: string; lat: number; lon: number } | null;
  /** Great-circle distance from the lowest-id saved Home with valid coordinates. */
  farthestDestination: { destination: YearlyDestination; distanceKm: number } | null;
  charging: YearlyChargingSummary;
};

export type YearlyInsightsInput = {
  drives: YearlyDriveInput[];
  charges: YearlyChargeInput[];
  places: YearlyPlaceInput[];
  year: number;
  timeZone: string;
  classification?: YearlyClassificationFilter;
  now: number;
};

function finite(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}

function nonnegative(value: number | null): value is number {
  return finite(value) && value >= 0;
}

function coordinates(lat: number | null, lon: number | null): { lat: number; lon: number } | null {
  return finite(lat) && finite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;
}

function cleanText(value: string | null): string | null {
  return value?.trim().replace(/\s+/g, " ") || null;
}

function byKey(a: { key: string }, b: { key: string }): number {
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

function driveTotals(drives: YearlyDriveInput[]): YearlyDriveTotals {
  const energy = summarizeDriveEnergy(drives.map((drive) => ({
    distanceKm: nonnegative(drive.distanceKm) ? drive.distanceKm : null,
    consumedEnergyKwh: finite(drive.consumedEnergyKwh) ? drive.consumedEnergyKwh : null,
    energyIsEstimated: drive.energyIsEstimated,
  })));
  const knownDistanceDriveCount = drives.filter((drive) => nonnegative(drive.distanceKm)).length;
  const knownDurationDriveCount = drives.filter((drive) => nonnegative(drive.durationSeconds)).length;
  const knownEnergyDriveCount = drives.filter((drive) => finite(drive.consumedEnergyKwh)).length;
  return {
    driveCount: drives.length,
    totalDistanceKm: energy.totalDistanceKm,
    knownDistanceDriveCount,
    missingDistanceDriveCount: drives.length - knownDistanceDriveCount,
    totalDurationSeconds: drives.reduce((total, drive) => total + (nonnegative(drive.durationSeconds) ? drive.durationSeconds : 0), 0),
    knownDurationDriveCount,
    missingDurationDriveCount: drives.length - knownDurationDriveCount,
    totalEnergyKwh: energy.totalEnergyKwh,
    knownEnergyDriveCount,
    missingEnergyDriveCount: drives.length - knownEnergyDriveCount,
    estimatedEnergyDriveCount: drives.filter((drive) => finite(drive.consumedEnergyKwh) && drive.energyIsEstimated).length,
    avgConsumptionWhKm: energy.avgConsumptionWhKm,
  };
}

/** Nearest 0.001° grid centre; Math.round ties toward +Infinity, -0 becomes 0. */
function gridCoordinate(value: number): number {
  const rounded = Math.round(value * 1000) / 1000;
  return rounded === 0 ? 0 : rounded;
}

function destinationFor(drive: YearlyDriveInput, places: Map<number, YearlyPlaceInput>): Omit<YearlyDestination, "visitCount" | "firstVisitedAt" | "lastVisitedAt"> | null {
  if (drive.endPlaceId !== null) {
    const place = places.get(drive.endPlaceId);
    // An existing saved place owns its coordinates, even if they are missing.
    const position = place ? coordinates(place.lat, place.lon) : coordinates(drive.endLat, drive.endLon);
    return {
      key: `place:${drive.endPlaceId}`,
      placeId: drive.endPlaceId,
      name: place ? cleanText(place.name) : null,
      address: cleanText(drive.endAddress),
      lat: position?.lat ?? null,
      lon: position?.lon ?? null,
      isHome: place?.type === "home",
    };
  }
  const position = coordinates(drive.endLat, drive.endLon);
  if (!position) return null;
  const lat = gridCoordinate(position.lat);
  const lon = gridCoordinate(position.lon);
  return {
    key: `grid:${lat.toFixed(3)},${lon.toFixed(3)}`,
    placeId: null,
    name: null,
    address: cleanText(drive.endAddress),
    lat,
    lon,
    isHome: false,
  };
}

function destinationGroups(drives: YearlyDriveInput[], places: Map<number, YearlyPlaceInput>) {
  const groups = new Map<string, YearlyDestination>();
  const driveKeys = new Map<number, string>();
  let mappedDriveCount = 0;
  let groupedDriveCount = 0;
  // Chronological iteration makes representative addresses independent of input order.
  for (const drive of [...drives].sort((a, b) => a.endTime! - b.endTime! || a.id - b.id)) {
    const destination = destinationFor(drive, places);
    if (!destination) continue;
    groupedDriveCount++;
    if (destination.lat !== null && destination.lon !== null) mappedDriveCount++;
    driveKeys.set(drive.id, destination.key);
    const existing = groups.get(destination.key);
    if (existing) {
      existing.visitCount++;
      existing.lastVisitedAt = drive.endTime!;
      if (!existing.address && destination.address) existing.address = destination.address;
    } else {
      groups.set(destination.key, { ...destination, visitCount: 1, firstVisitedAt: drive.endTime!, lastVisitedAt: drive.endTime! });
    }
  }
  return {
    destinations: [...groups.values()].sort((a, b) => b.visitCount - a.visitCount || b.lastVisitedAt - a.lastVisitedAt || byKey(a, b)),
    driveKeys,
    coverage: { groupedDriveCount, mappedDriveCount, missingDestinationDriveCount: drives.length - groupedDriveCount },
  };
}

function greatCircleKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180;
  const h = Math.sin((b.lat - a.lat) * rad / 2) ** 2
    + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((b.lon - a.lon) * rad / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}

/** Database costs have scale 2; malformed or higher-precision values stay missing. */
function costCents(value: string | null): bigint | null {
  if (value === null || !/^[+-]?\d+(?:\.\d{1,2})?$/.test(value.trim())) return null;
  const trimmed = value.trim();
  const [whole, fraction = ""] = trimmed.replace(/^[+-]/, "").split(".");
  const cents = BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, "0"));
  return trimmed.startsWith("-") ? -cents : cents;
}

function decimalCost(cents: bigint): string {
  const absolute = cents < 0n ? -cents : cents;
  return `${cents < 0n ? "-" : ""}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, "0")}`;
}

function chargeSummary(charges: YearlyChargeInput[], places: Map<number, YearlyPlaceInput>): YearlyChargingSummary {
  const costs = new Map<string | null, { cents: bigint; sessionCount: number }>();
  const locations = new Map<string, NonNullable<YearlyChargingSummary["favoriteLocation"]>>();
  let energyAddedKwh = 0;
  let knownEnergySessionCount = 0;
  let knownCostSessionCount = 0;
  let peakDcPowerKw: number | null = null;
  for (const charge of [...charges].sort((a, b) => a.startTime - b.startTime || a.id - b.id)) {
    if (nonnegative(charge.energyAddedKwh)) {
      energyAddedKwh += charge.energyAddedKwh;
      knownEnergySessionCount++;
    }
    if (charge.chargerType === "dc" && nonnegative(charge.maxPowerKw)) peakDcPowerKw = Math.max(peakDcPowerKw ?? 0, charge.maxPowerKw);
    const cents = costCents(charge.cost);
    if (cents !== null) {
      const normalizedCurrency = charge.currency?.trim().toUpperCase();
      const currency = normalizedCurrency && /^[A-Z]{3}$/.test(normalizedCurrency) ? normalizedCurrency : null;
      const group = costs.get(currency) ?? { cents: 0n, sessionCount: 0 };
      group.cents += cents;
      group.sessionCount++;
      costs.set(currency, group);
      knownCostSessionCount++;
    }
    const address = cleanText(charge.address);
    const key = charge.placeId !== null ? `place:${charge.placeId}` : address ? `address:${address.toLowerCase()}` : null;
    if (key !== null) {
      const existing = locations.get(key);
      if (existing) existing.sessionCount++;
      else locations.set(key, {
        key, placeId: charge.placeId, name: charge.placeId === null ? null : cleanText(places.get(charge.placeId)?.name ?? null),
        address, sessionCount: 1,
      });
    }
  }
  const acCount = charges.filter((charge) => charge.chargerType === "ac").length;
  const dcCount = charges.filter((charge) => charge.chargerType === "dc").length;
  return {
    sessionCount: charges.length, acCount, dcCount, unknownTypeCount: charges.length - acCount - dcCount,
    energyAddedKwh, knownEnergySessionCount, missingEnergySessionCount: charges.length - knownEnergySessionCount,
    peakDcPowerKw,
    costs: [...costs.entries()].sort(([a], [b]) => a === null ? 1 : b === null ? -1 : a < b ? -1 : a > b ? 1 : 0)
      .map(([currency, group]) => ({ currency, total: decimalCost(group.cents), sessionCount: group.sessionCount })),
    knownCostSessionCount, missingCostSessionCount: charges.length - knownCostSessionCount,
    favoriteLocation: [...locations.values()].sort((a, b) => b.sessionCount - a.sessionCount || byKey(a, b))[0] ?? null,
  };
}

/** Annual destination visits and recap from local metadata for one vehicle.
 * Completed rows belong to the year/month of START in the supplied app timezone,
 * including a drive that finishes in January after starting in December.
 * Drive classification affects all drive-derived cards; charging stays annual.
 */
export function buildYearlyInsights(input: YearlyInsightsInput): YearlyInsights {
  if (!Number.isInteger(input.year) || input.year < 1 || input.year > 9999) throw new RangeError("year must be an integer from 1 to 9999");
  if (!Number.isFinite(new Date(input.now).getTime())) throw new RangeError("now must be a valid timestamp");
  const classification = input.classification ?? "all";
  if (classification !== "all" && !YEARLY_CLASSIFICATIONS.includes(classification)) throw new RangeError("unknown classification");
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone: input.timeZone, calendar: "gregory", numberingSystem: "latn", year: "numeric", month: "numeric" });
  const monthFor = (row: { startTime: number; endTime: number | null }): number | null => {
    if (!Number.isFinite(new Date(row.startTime).getTime()) || !finite(row.endTime)
      || !Number.isFinite(new Date(row.endTime).getTime()) || row.endTime <= row.startTime || row.endTime > input.now) return null;
    const parts = formatter.formatToParts(row.startTime);
    const year = Number(parts.find((part) => part.type === "year")!.value);
    return year === input.year ? Number(parts.find((part) => part.type === "month")!.value) : null;
  };
  const annualDrives = input.drives.map((drive) => ({ drive, month: monthFor(drive) }))
    .filter((entry) => entry.month !== null && (classification === "all" || entry.drive.classification === classification));
  const drives = annualDrives.map((entry) => entry.drive);
  const charges = input.charges.filter((charge) => monthFor(charge) !== null);
  const places = new Map(input.places.map((place) => [place.id, place]));
  const grouped = destinationGroups(drives, places);
  const nonHome = grouped.destinations.filter((destination) => !destination.isHome);
  const longest = [...drives].filter((drive) => nonnegative(drive.distanceKm))
    .sort((a, b) => b.distanceKm! - a.distanceKm! || a.startTime - b.startTime || a.id - b.id)[0];
  const home = [...input.places].filter((place) => place.type === "home" && coordinates(place.lat, place.lon) !== null)
    .sort((a, b) => a.id - b.id)[0];
  const homeReference = home ? { id: home.id, name: home.name, lat: home.lat!, lon: home.lon! } : null;
  const farthestDestination = homeReference ? grouped.destinations
    .filter((destination) => destination.lat !== null && destination.lon !== null)
    .map((destination) => ({ destination, distanceKm: greatCircleKm(homeReference, { lat: destination.lat!, lon: destination.lon! }) }))
    .sort((a, b) => b.distanceKm - a.distanceKm || byKey(a.destination, b.destination))[0] ?? null : null;
  return {
    year: input.year,
    timeZone: input.timeZone,
    classification,
    totals: driveTotals(drives),
    classifications: YEARLY_CLASSIFICATIONS.map((value) => {
      const totals = driveTotals(drives.filter((drive) => drive.classification === value));
      return {
        classification: value, driveCount: totals.driveCount, distanceKm: totals.totalDistanceKm,
        knownDistanceDriveCount: totals.knownDistanceDriveCount, missingDistanceDriveCount: totals.missingDistanceDriveCount,
      };
    }),
    months: Array.from({ length: 12 }, (_, index) => {
      const totals = driveTotals(annualDrives.filter((entry) => entry.month === index + 1).map((entry) => entry.drive));
      return {
        month: index + 1, driveCount: totals.driveCount, distanceKm: totals.totalDistanceKm,
        durationSeconds: totals.totalDurationSeconds, energyKwh: totals.totalEnergyKwh,
        knownDistanceDriveCount: totals.knownDistanceDriveCount, missingDistanceDriveCount: totals.missingDistanceDriveCount,
        knownEnergyDriveCount: totals.knownEnergyDriveCount, missingEnergyDriveCount: totals.missingEnergyDriveCount,
        estimatedEnergyDriveCount: totals.estimatedEnergyDriveCount,
      };
    }),
    destinations: grouped.destinations,
    destinationCoverage: grouped.coverage,
    favoriteDestination: nonHome[0] ?? grouped.destinations[0] ?? null,
    longestDrive: longest ? {
      id: longest.id, startTime: longest.startTime, distanceKm: longest.distanceKm!,
      durationSeconds: nonnegative(longest.durationSeconds) ? longest.durationSeconds : null,
      destinationKey: grouped.driveKeys.get(longest.id) ?? null,
    } : null,
    homeReference,
    farthestDestination,
    charging: chargeSummary(charges, places),
  };
}
