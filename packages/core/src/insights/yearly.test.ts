import { describe, expect, it } from "vitest";
import {
  buildYearlyInsights,
  type YearlyChargeInput,
  type YearlyDriveInput,
  type YearlyInsightsInput,
  type YearlyPlaceInput,
} from "./yearly.js";

const JANUARY = Date.parse("2026-01-15T12:00:00Z");
const NOW = Date.parse("2027-01-02T00:00:00Z");

function drive(id = 1, overrides: Partial<YearlyDriveInput> = {}): YearlyDriveInput {
  return {
    id, startTime: JANUARY, endTime: JANUARY + 1800_000,
    classification: "private", distanceKm: 10, durationSeconds: 1800,
    consumedEnergyKwh: 2, energyIsEstimated: true,
    endPlaceId: null, endLat: 48, endLon: 8, endAddress: "Sample destination",
    ...overrides,
  };
}

function charge(id = 1, overrides: Partial<YearlyChargeInput> = {}): YearlyChargeInput {
  return {
    id, startTime: JANUARY, endTime: JANUARY + 3600_000,
    energyAddedKwh: 20, maxPowerKw: 11, chargerType: "ac",
    cost: null, currency: "EUR", placeId: null, address: "Sample charger",
    ...overrides,
  };
}

function place(id = 1, overrides: Partial<YearlyPlaceInput> = {}): YearlyPlaceInput {
  return { id, name: `Place ${id}`, type: "other", lat: 48, lon: 8, ...overrides };
}

function build(overrides: Partial<YearlyInsightsInput> = {}) {
  return buildYearlyInsights({ drives: [], charges: [], places: [], year: 2026, timeZone: "Europe/Berlin", now: NOW, ...overrides });
}

describe("annual selection and coverage", () => {
  it("returns 12 empty months, all classifications and no invented highlights", () => {
    const result = build();
    expect(result.totals).toEqual({
      driveCount: 0, totalDistanceKm: 0, knownDistanceDriveCount: 0, missingDistanceDriveCount: 0,
      totalDurationSeconds: 0, knownDurationDriveCount: 0, missingDurationDriveCount: 0,
      totalEnergyKwh: 0, knownEnergyDriveCount: 0, missingEnergyDriveCount: 0,
      estimatedEnergyDriveCount: 0, avgConsumptionWhKm: null,
    });
    expect(result.months.map((month) => month.month)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(result.months.every((month) => month.driveCount === 0 && month.distanceKm === 0)).toBe(true);
    expect(result.classifications.map((group) => group.classification)).toEqual(["private", "business", "commute", "unclassified"]);
    expect(result.destinations).toEqual([]);
    expect(result.favoriteDestination).toBeNull();
    expect(result.longestDrive).toBeNull();
    expect(result.homeReference).toBeNull();
    expect(result.farthestDestination).toBeNull();
    expect(result.charging).toMatchObject({ sessionCount: 0, costs: [], peakDcPowerKw: null, favoriteLocation: null });
  });

  it("assigns the year and month from start time in the app timezone", () => {
    const starts = [
      "2025-12-31T23:30:00Z", // January 2026 in Berlin.
      "2026-12-31T22:30:00Z", // December 2026, even when ending in January.
      "2026-12-31T23:30:00Z", // January 2027 in Berlin.
      "2026-08-31T22:30:00Z", // September 2026 with summer time.
    ];
    const result = build({ drives: starts.map((iso, index) => {
      const startTime = Date.parse(iso);
      return drive(index + 1, { startTime, endTime: startTime + 3600_000 });
    }) });
    expect(result.totals.driveCount).toBe(3);
    expect(result.months.filter((month) => month.driveCount).map((month) => [month.month, month.driveCount])).toEqual([[1, 1], [9, 1], [12, 1]]);
  });

  it("handles a timezone west of UTC at the year boundary", () => {
    const startTime = Date.parse("2026-01-01T00:30:00Z");
    const input = { drives: [drive(1, { startTime, endTime: startTime + 1800_000 })], timeZone: "America/Los_Angeles" };
    expect(build(input).totals.driveCount).toBe(0);
    expect(build({ ...input, year: 2025 }).months[11]!.driveCount).toBe(1);
  });

  it("requires completed valid rows and accepts a session ending exactly now", () => {
    const now = JANUARY + 3600_000;
    const bounds = [
      { startTime: JANUARY, endTime: null },
      { startTime: JANUARY, endTime: JANUARY },
      { startTime: JANUARY, endTime: JANUARY - 1 },
      { startTime: JANUARY, endTime: now + 1 },
      { startTime: Number.NaN, endTime: now },
      { startTime: JANUARY, endTime: Number.POSITIVE_INFINITY },
      { startTime: JANUARY, endTime: now },
    ];
    const result = build({ now, drives: bounds.map((value, index) => drive(index, value)), charges: bounds.map((value, index) => charge(index, value)) });
    expect(result.totals.driveCount).toBe(1);
    expect(result.charging.sessionCount).toBe(1);
  });

  it("applies the drive classification filter to every drive-derived result while retaining annual charging", () => {
    const inputs = {
      drives: [drive(1, { classification: "private", distanceKm: 100 }), drive(2, { classification: "business", distanceKm: 20, endLat: 50 })],
      charges: [charge(1), charge(2)],
    };
    const all = build(inputs);
    const business = build({ ...inputs, classification: "business" });
    expect(all.totals.driveCount).toBe(2);
    expect(business.totals.driveCount).toBe(1);
    expect(business.totals.totalDistanceKm).toBe(20);
    expect(business.longestDrive!.id).toBe(2);
    expect(business.destinations).toHaveLength(1);
    expect(business.favoriteDestination!.lat).toBe(50);
    expect(business.months[0]!.driveCount).toBe(1);
    expect(business.classifications.map((group) => group.driveCount)).toEqual([0, 1, 0, 0]);
    expect(business.charging).toEqual(all.charging);
  });

  it("keeps missing, zero and estimated measurements distinct and averages only paired distance and energy", () => {
    const result = build({ drives: [
      drive(1, { distanceKm: 20, consumedEnergyKwh: 4 }),
      drive(2, { distanceKm: 10, consumedEnergyKwh: null }),
      drive(3, { distanceKm: null, consumedEnergyKwh: 3, energyIsEstimated: false }),
      drive(4, { distanceKm: 0, consumedEnergyKwh: -1, durationSeconds: 0 }),
      drive(5, { distanceKm: -1, consumedEnergyKwh: Number.NaN, durationSeconds: Number.POSITIVE_INFINITY }),
    ] });
    expect(result.totals).toEqual({
      driveCount: 5, totalDistanceKm: 30, knownDistanceDriveCount: 3, missingDistanceDriveCount: 2,
      totalDurationSeconds: 5400, knownDurationDriveCount: 4, missingDurationDriveCount: 1,
      totalEnergyKwh: 6, knownEnergyDriveCount: 3, missingEnergyDriveCount: 2,
      estimatedEnergyDriveCount: 2, avgConsumptionWhKm: 200,
    });
    expect(result.months[0]).toMatchObject({ energyKwh: 6, knownEnergyDriveCount: 3, missingEnergyDriveCount: 2, estimatedEnergyDriveCount: 2, missingDistanceDriveCount: 2 });
    expect(result.classifications[0]).toMatchObject({ missingDistanceDriveCount: 2 });
  });

  it("does not derive missing distance, energy or duration from unrelated metadata", () => {
    const result = build({ drives: [drive(1, { distanceKm: null, durationSeconds: null, consumedEnergyKwh: null })] });
    expect(result.totals).toMatchObject({
      driveCount: 1, knownDistanceDriveCount: 0, missingDistanceDriveCount: 1,
      knownDurationDriveCount: 0, missingDurationDriveCount: 1,
      knownEnergyDriveCount: 0, missingEnergyDriveCount: 1, estimatedEnergyDriveCount: 0, avgConsumptionWhKm: null,
    });
    expect(result.longestDrive).toBeNull();
  });

  it("rejects invalid year, timezone, clock or classification options", () => {
    expect(() => build({ year: 2026.5 })).toThrow(RangeError);
    expect(() => build({ year: 0 })).toThrow(RangeError);
    expect(() => build({ timeZone: "not/a/timezone" })).toThrow(RangeError);
    expect(() => build({ now: Number.NaN })).toThrow(RangeError);
    expect(() => build({ classification: "invalid" as "all" })).toThrow(RangeError);
  });
});

describe("annual destination grouping and highlights", () => {
  it("groups by saved place identity and uses its coordinates instead of noisy endpoints", () => {
    const result = build({
      places: [place(1, { name: "Gym", lat: 49, lon: 9 }), place(2, { name: "Cafe", lat: 49, lon: 9 })],
      drives: [
        drive(1, { endPlaceId: 1, endLat: 10, endLon: 20 }),
        drive(2, { endPlaceId: 1, endLat: 60, endLon: 70 }),
        drive(3, { endPlaceId: 2, endLat: 49, endLon: 9 }),
      ],
    });
    expect(result.destinations).toHaveLength(2);
    expect(result.destinations[0]).toMatchObject({ key: "place:1", name: "Gym", lat: 49, lon: 9, visitCount: 2 });
    expect(result.destinations[1]).toMatchObject({ key: "place:2", visitCount: 1 });
    expect(result.destinationCoverage).toEqual({ groupedDriveCount: 3, mappedDriveCount: 3, missingDestinationDriveCount: 0 });
  });

  it("uses nearest 0.001-degree grid centres and does not join different cells by address", () => {
    const result = build({ drives: [
      drive(1, { endLat: 48.0001, endLon: 8.0001, endAddress: "First" }),
      drive(2, { endLat: 48.0004, endLon: 8.0004, endAddress: "Second" }),
      drive(3, { endLat: 48.0006, endLon: 8.0006, endAddress: "First" }),
    ] });
    expect(result.destinations.map((destination) => [destination.key, destination.visitCount])).toEqual([
      ["grid:48.000,8.000", 2], ["grid:48.001,8.001", 1],
    ]);
  });

  it("documents negative rounding and normalizes negative zero in grid keys and coordinates", () => {
    const result = build({ drives: [
      drive(1, { endLat: -1.0004, endLon: -2.0004 }),
      drive(2, { endLat: -1.0006, endLon: -2.0006 }),
      drive(3, { endLat: -0.0005, endLon: -0.0001 }),
      drive(4, { endLat: 0.0005, endLon: 0.0005 }),
    ] });
    const keys = result.destinations.map((destination) => destination.key);
    expect(keys).toContain("grid:-1.000,-2.000");
    expect(keys).toContain("grid:-1.001,-2.001");
    expect(keys).toContain("grid:0.000,0.000");
    expect(keys).toContain("grid:0.001,0.001");
    expect(Object.is(result.destinations.find((destination) => destination.key === "grid:0.000,0.000")!.lat, -0)).toBe(false);
  });

  it("counts missing destination evidence without inventing a location from an address", () => {
    const result = build({ drives: [
      drive(1, { endLat: null, endLon: null, endAddress: "Home" }),
      drive(2, { endLat: 91, endLon: 8 }),
      drive(3, { endLat: 48, endLon: Number.NaN }),
      drive(4, { endLat: 48, endLon: 181 }),
    ] });
    expect(result.destinations).toEqual([]);
    expect(result.destinationCoverage).toEqual({ groupedDriveCount: 0, mappedDriveCount: 0, missingDestinationDriveCount: 4 });
  });

  it("keeps a saved destination count when its authoritative coordinates are unavailable", () => {
    const result = build({ places: [place(1, { lat: null, lon: null })], drives: [drive(1, { endPlaceId: 1, endLat: 48, endLon: 8 })] });
    expect(result.destinations[0]).toMatchObject({ key: "place:1", lat: null, lon: null, visitCount: 1 });
    expect(result.destinationCoverage).toEqual({ groupedDriveCount: 1, mappedDriveCount: 0, missingDestinationDriveCount: 0 });
  });

  it("excludes every typed Home from favorites when another destination exists", () => {
    const result = build({
      places: [place(1, { type: "home" }), place(2, { type: "home" }), place(3, { name: "Park" })],
      drives: [drive(1, { endPlaceId: 1 }), drive(2, { endPlaceId: 1 }), drive(3, { endPlaceId: 2 }), drive(4, { endPlaceId: 3 })],
    });
    expect(result.destinations[0]!.placeId).toBe(1);
    expect(result.favoriteDestination!.placeId).toBe(3);
  });

  it("allows Home as favorite when only Home was visited, without inferring Home from its name", () => {
    const onlyHome = build({ places: [place(1, { type: "home" })], drives: [drive(1, { endPlaceId: 1 })] });
    expect(onlyHome.favoriteDestination).toMatchObject({ placeId: 1, isHome: true });
    const nameOnly = build({ places: [place(1, { name: "Home", type: "other" })], drives: [drive(1, { endPlaceId: 1 })] });
    expect(nameOnly.favoriteDestination!.isHome).toBe(false);
    expect(nameOnly.homeReference).toBeNull();
    expect(nameOnly.farthestDestination).toBeNull();
  });

  it("measures farthest destination as great-circle distance from the lowest-id valid saved Home", () => {
    const result = build({
      places: [
        place(1, { type: "home", lat: null, lon: null }),
        place(3, { type: "home", lat: 40, lon: 40 }),
        place(2, { type: "home", lat: 0, lon: 0 }),
      ],
      drives: [drive(1, { endLat: 0, endLon: 1, distanceKm: 1000 }), drive(2, { endLat: 0, endLon: 2, distanceKm: 1 })],
    });
    expect(result.homeReference).toMatchObject({ id: 2, lat: 0, lon: 0 });
    expect(result.farthestDestination!.destination.lon).toBe(2);
    expect(result.farthestDestination!.distanceKm).toBeCloseTo(222.39016, 4);
    expect(result.longestDrive!.id).toBe(1);
  });

  it("does not infer a Home reference from drive endpoints, and handles missing mapped destinations", () => {
    expect(build({ drives: [drive()] }).farthestDestination).toBeNull();
    const result = build({ places: [place(1, { type: "home" })], drives: [drive(1, { endLat: null, endLon: null })] });
    expect(result.homeReference!.id).toBe(1);
    expect(result.farthestDestination).toBeNull();
  });

  it("keeps Haversine distance finite for antipodal destinations", () => {
    const result = build({ places: [place(1, { type: "home", lat: 0, lon: 0 })], drives: [drive(1, { endLat: 0, endLon: 180 })] });
    expect(result.farthestDestination!.distanceKm).toBeCloseTo(Math.PI * 6371.0088, 6);
  });

  it("uses deterministic ties for the longest drive and destination ordering without mutating input", () => {
    const inputs = {
      drives: [drive(3, { distanceKm: 50 }), drive(2, { distanceKm: 50 }), drive(1, { distanceKm: Number.NaN }), drive(4, { distanceKm: -10 })],
      places: [place(1)], charges: [charge()],
    };
    const before = structuredClone(inputs);
    const result = build(inputs);
    expect(result.longestDrive).toMatchObject({ id: 2, distanceKm: 50, destinationKey: "grid:48.000,8.000" });
    expect(build({ ...inputs, drives: [...inputs.drives].reverse() })).toEqual(result);
    expect(inputs).toEqual(before);
  });

  it("records actual arrival times and uses the latest visit to break destination popularity ties", () => {
    const result = build({ drives: [drive(1, { endLat: 48, endTime: JANUARY + 1000 }), drive(2, { endLat: 49, endTime: JANUARY + 2000 })] });
    expect(result.favoriteDestination).toMatchObject({ lat: 49, firstVisitedAt: JANUARY + 2000, lastVisitedAt: JANUARY + 2000 });
  });
});

describe("annual charging recap", () => {
  it("uses the same completed start-time year boundary for charges", () => {
    const before = Date.parse("2025-12-31T23:30:00Z");
    const after = Date.parse("2026-12-31T23:30:00Z");
    const result = build({ charges: [charge(1, { startTime: before, endTime: before + 3600_000 }), charge(2, { startTime: after, endTime: after + 3600_000 })] });
    expect(result.charging.sessionCount).toBe(1);
  });

  it("counts AC, DC and unknown sessions while preserving missing energy and the recorded DC peak", () => {
    const result = build({ charges: [
      charge(1, { chargerType: "dc", maxPowerKw: 100, energyAddedKwh: 30 }),
      charge(2, { chargerType: "dc", maxPowerKw: 250, energyAddedKwh: null }),
      charge(3, { chargerType: "ac", maxPowerKw: 1000, energyAddedKwh: 0 }),
      charge(4, { chargerType: null, maxPowerKw: 2000, energyAddedKwh: -10 }),
      charge(5, { chargerType: "dc", maxPowerKw: Number.NaN, energyAddedKwh: Number.NaN }),
    ] });
    expect(result.charging).toMatchObject({
      sessionCount: 5, acCount: 1, dcCount: 3, unknownTypeCount: 1,
      energyAddedKwh: 30, knownEnergySessionCount: 2, missingEnergySessionCount: 3, peakDcPowerKw: 250,
    });
  });

  it("sums decimal cents exactly and never mixes currencies or unknown currency", () => {
    const result = build({ charges: [
      charge(1, { cost: "0.10", currency: " eur " }), charge(2, { cost: "0.20", currency: "EUR" }),
      charge(3, { cost: "1.23", currency: "USD" }), charge(4, { cost: "2.34", currency: null }),
      charge(5, { cost: "0.01", currency: "" }), charge(6, { cost: null, currency: "EUR" }),
    ] });
    expect(result.charging.costs).toEqual([
      { currency: "EUR", total: "0.30", sessionCount: 2 },
      { currency: "USD", total: "1.23", sessionCount: 1 },
      { currency: null, total: "2.35", sessionCount: 2 },
    ]);
    expect(result.charging.knownCostSessionCount).toBe(5);
    expect(result.charging.missingCostSessionCount).toBe(1);
  });

  it("keeps free charges, explicit negative credits and large totals exact", () => {
    const result = build({ charges: [
      charge(1, { cost: "99999999.99" }), charge(2, { cost: "0.06" }),
      charge(3, { cost: "-0.05" }), charge(4, { cost: "0" }),
    ] });
    expect(result.charging.costs).toEqual([{ currency: "EUR", total: "100000000.00", sessionCount: 4 }]);
    expect(result.charging.missingCostSessionCount).toBe(0);
  });

  it("does not invent cost values from malformed or higher-precision amounts", () => {
    const values = [null, "", "NaN", "Infinity", "1e2", "12.345", "0.00", "+2.4"];
    const result = build({ charges: values.map((cost, index) => charge(index, { cost })) });
    expect(result.charging.costs).toEqual([{ currency: "EUR", total: "2.40", sessionCount: 2 }]);
    expect(result.charging.knownCostSessionCount).toBe(2);
    expect(result.charging.missingCostSessionCount).toBe(6);
  });

  it("groups favorite charging locations by place identity before normalized address", () => {
    const result = build({
      places: [place(1, { name: "Garage" })],
      charges: [
        charge(1, { placeId: 1, address: "First address" }), charge(2, { placeId: 1, address: "Second address" }),
        charge(3, { address: " Public   charger " }), charge(4, { address: "public charger" }), charge(5, { address: "PUBLIC CHARGER" }),
      ],
    });
    expect(result.charging.favoriteLocation).toMatchObject({ key: "address:public charger", sessionCount: 3 });
    const saved = build({ places: [place(1, { name: "Garage" })], charges: [charge(1, { placeId: 1 }), charge(2, { placeId: 1 })] });
    expect(saved.charging.favoriteLocation).toMatchObject({ key: "place:1", name: "Garage", sessionCount: 2 });
  });

  it("leaves the favorite charger unavailable when no location is recorded", () => {
    const result = build({ charges: [charge(1, { placeId: null, address: null })] });
    expect(result.charging.favoriteLocation).toBeNull();
  });
});
