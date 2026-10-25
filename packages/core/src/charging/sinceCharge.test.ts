import { describe, expect, it } from "vitest";
import { summarizeSinceChargeDrives, type SinceChargeDrive } from "./sinceCharge.js";
const drive = (patch: Partial<SinceChargeDrive> = {}): SinceChargeDrive => ({
  startTime: 100, endTime: 200, distanceKm: 10, consumedEnergyKwh: 2,
  energyIsEstimated: true, durationSeconds: 100, ...patch,
});
describe("since-charge driving summary", () => {
  it("uses wholly completed drives and counts excluded straddling drives", () => {
    const result = summarizeSinceChargeDrives([
      drive(), drive({ startTime: 50 }), drive({ endTime: null }),
      drive({ endTime: 400 }), drive({ endTime: 99 }), drive({ startTime: NaN }),
    ], 100, 300);
    expect(result).toMatchObject({ driveCount: 1, distanceKm: 10, energyKwh: 2,
      avgConsumptionWhKm: 200, durationSeconds: 100, anyEstimated: true, excludedStraddlingDriveCount: 1 });
  });
  it("keeps zero drives honest without invented consumption", () => {
    expect(summarizeSinceChargeDrives([], 100, 300)).toMatchObject({
      driveCount: 0, distanceKm: 0, energyKwh: 0, durationSeconds: 0,
      avgConsumptionWhKm: null, hasIncompleteEnergy: false, anyEstimated: false,
    });
  });
  it("distinguishes entirely missing energy and distance from zero", () => {
    expect(summarizeSinceChargeDrives([drive({ consumedEnergyKwh: null, distanceKm: null, durationSeconds: -1 })], 100, 300))
      .toMatchObject({ energyKwh: null, distanceKm: null, avgConsumptionWhKm: null,
        hasIncompleteEnergy: true, missingEnergyDriveCount: 1, missingDistanceDriveCount: 1, durationSeconds: null });
  });
  it("weights consumption using paired distance and energy and exposes partial coverage", () => {
    expect(summarizeSinceChargeDrives([drive(), drive({ distanceKm: 30, consumedEnergyKwh: 3 }),
      drive({ consumedEnergyKwh: null, durationSeconds: null })], 100, 300))
      .toMatchObject({ driveCount: 3, distanceKm: 50, energyKwh: 5,
        avgConsumptionWhKm: 125, hasIncompleteEnergy: true, durationSeconds: null });
  });
  it.each([NaN, Infinity, 400])("does not select records for invalid boundary %s", (boundary) => {
    expect(summarizeSinceChargeDrives([drive()], boundary, 300).driveCount).toBe(0);
  });
});
