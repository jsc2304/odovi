import { describe, expect, it } from "vitest";
import { summarizeCharges, summarizeDriveEnergy } from "./summaries.js";

describe("summarizeDriveEnergy", () => {
  it("weights consumption by usable distance", () => {
    const result = summarizeDriveEnergy([
      { distanceKm: 10, consumedEnergyKwh: 2, energyIsEstimated: false },
      { distanceKm: 100, consumedEnergyKwh: 15, energyIsEstimated: true },
    ]);

    expect(result.avgConsumptionWhKm).toBeCloseTo(154.55, 2);
    expect(result.totalDistanceKm).toBe(110);
    expect(result.totalEnergyKwh).toBe(17);
    expect(result.anyEstimated).toBe(true);
  });

  it("excludes missing pairs without treating them as zero", () => {
    const result = summarizeDriveEnergy([
      { distanceKm: 20, consumedEnergyKwh: null, energyIsEstimated: false },
      { distanceKm: 10, consumedEnergyKwh: 1.8, energyIsEstimated: false },
    ]);

    expect(result.totalDistanceKm).toBe(30);
    expect(result.usableDistanceKm).toBe(10);
    expect(result.avgConsumptionWhKm).toBe(180);
    expect(result.hasIncompleteEnergy).toBe(true);
  });
});

describe("summarizeCharges", () => {
  it("computes normalized metrics and energy-weighted coverage", () => {
    const result = summarizeCharges([
      {
        energyAddedKwh: 20,
        durationSeconds: 7200,
        cost: "6.00",
        currency: "EUR",
        chargerType: "ac",
      },
      {
        energyAddedKwh: 30,
        durationSeconds: 1800,
        cost: null,
        currency: null,
        chargerType: "dc",
      },
    ]);

    expect(result.totalEnergyKwh).toBe(50);
    expect(result.avgEnergyPerSessionKwh).toBe(25);
    expect(result.costCoverage).toBeCloseTo(0.4);
    expect(result.costPerKwh).toBeCloseTo(0.3);
    expect(result.acEnergyShare).toBeCloseTo(0.4);
    expect(result.dcEnergyShare).toBeCloseTo(0.6);
    expect(result.effectivePowerKw).toBeCloseTo(20);
  });

  it("does not combine mixed currencies", () => {
    const result = summarizeCharges([
      {
        energyAddedKwh: 10,
        durationSeconds: 3600,
        cost: "3.00",
        currency: "EUR",
        chargerType: "ac",
      },
      {
        energyAddedKwh: 10,
        durationSeconds: 3600,
        cost: "4.00",
        currency: "CHF",
        chargerType: "ac",
      },
    ]);

    expect(result.mixedCurrencies).toBe(true);
    expect(result.totalCost).toBeNull();
    expect(result.costPerKwh).toBeNull();
    expect(result.costCoverage).toBe(1);
  });

  it("ignores zero duration and missing energy", () => {
    const result = summarizeCharges([
      {
        energyAddedKwh: null,
        durationSeconds: 3600,
        cost: null,
        currency: null,
        chargerType: null,
      },
      {
        energyAddedKwh: 12,
        durationSeconds: 0,
        cost: null,
        currency: null,
        chargerType: "dc",
      },
    ]);

    expect(result.avgEnergyPerSessionKwh).toBe(12);
    expect(result.effectivePowerKw).toBeNull();
    expect(result.costCoverage).toBe(0);
  });

  it("keeps untyped charging energy visible in AC/DC shares", () => {
    const result = summarizeCharges([
      {
        energyAddedKwh: 10,
        durationSeconds: 3600,
        cost: null,
        currency: null,
        chargerType: "ac",
      },
      {
        energyAddedKwh: 10,
        durationSeconds: 3600,
        cost: null,
        currency: null,
        chargerType: null,
      },
    ]);

    expect(result.acEnergyShare).toBe(0.5);
    expect(result.dcEnergyShare).toBe(0);
  });
});
