import { summarizeDriveEnergy, type DriveEnergySample } from "../summaries.js";

export type SinceChargeDrive = DriveEnergySample & {
  startTime: number;
  endTime: number | null;
  durationSeconds: number | null;
};

export function summarizeSinceChargeDrives(drives: SinceChargeDrive[], chargeEnd: number, now: number) {
  const valid = drives.filter((drive) => Number.isFinite(chargeEnd) && Number.isFinite(now) && chargeEnd <= now
    && Number.isFinite(drive.startTime)
    && drive.endTime !== null && Number.isFinite(drive.endTime)
    && drive.endTime > drive.startTime && drive.endTime <= now);
  const included = valid.filter((drive) => drive.startTime >= chargeEnd);
  const energy = summarizeDriveEnergy(included);
  const missingEnergyDriveCount = included.filter((drive) => drive.consumedEnergyKwh === null
    || !Number.isFinite(drive.consumedEnergyKwh)).length;
  const missingDistanceDriveCount = included.filter((drive) => drive.distanceKm === null
    || !Number.isFinite(drive.distanceKm) || drive.distanceKm < 0).length;
  return {
    driveCount: included.length,
    distanceKm: included.length > 0 && missingDistanceDriveCount === included.length ? null : energy.totalDistanceKm,
    missingDistanceDriveCount,
    energyKwh: included.length > 0 && missingEnergyDriveCount === included.length ? null : energy.totalEnergyKwh,
    missingEnergyDriveCount,
    avgConsumptionWhKm: energy.avgConsumptionWhKm,
    anyEstimated: energy.anyEstimated,
    hasIncompleteEnergy: energy.hasIncompleteEnergy || missingEnergyDriveCount > 0,
    durationSeconds: included.every((drive) => drive.durationSeconds !== null
      && Number.isFinite(drive.durationSeconds) && drive.durationSeconds >= 0)
      ? included.reduce((total, drive) => total + drive.durationSeconds!, 0) : null,
    excludedStraddlingDriveCount: valid.filter((drive) => drive.startTime < chargeEnd && drive.endTime! > chargeEnd).length,
  };
}

export type SinceChargeSummary = ReturnType<typeof summarizeSinceChargeDrives>;
